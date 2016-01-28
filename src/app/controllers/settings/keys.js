angular.module("proton.controllers.Settings")

.controller('KeysController', function(
    $log,
    $scope,
    $translate,
    authentication,
    confirmModal,
    reactivateModal,
    Key,
    networkActivityTracker,
    notify,
    pmcw
) {
    // Detect if the current browser is Safari to disable / hide download action
    $scope.isSafari = jQuery.browser.name === 'safari';
    $scope.isPrivate = authentication.user.Private === 1;
    $scope.isNonPrivate = authentication.user.Private === 0;
    // Store addresses in the controller
    $scope.addresses = authentication.user.Addresses;

    // Add information for each key
    _.each($scope.addresses, function(address) {
        _.each(address.Keys, function(key) {
            pmcw.keyInfo(key.PrivateKey).then(function(info) {
                key.created = info.created;
                key.bitSize = info.bitSize; // We don't use this data currently
                key.fingerprint = info.fingerprint;
            });
        });
    });

    /**
     * Download key
     * @param {String} key
     * @param {String} email
     * @param {String} type - 'public' or 'private'
     */
    $scope.download = function(key, email, type) {
        var blob = new Blob([key], { type: 'data:text/plain;charset=utf-8;' });
        var filename = type + 'key.' + email + '.txt';

        try {
            saveAs(blob, filename);
        } catch (error) {
            $log.error(error);
        } finally {
            $log.debug('saveAs');
        }
    };

    /**
     * Delete key
     */
    $scope.delete = function(address, key) {
        var title = $translate.instant('DELETE_KEY');
        var message = $translate.instant('CONFIRM_DELETE_KEY');
        var index = address.Keys.indexOf(key);

        confirmModal.activate({
            params: {
                title: title,
                message: message,
                confirm: function() {
                    Key.delete(key.ID).then(function(result) {
                        if (result.data && result.data.Code === 1000) {
                            address.Keys.splice(index, 1);
                            notify({message: $translate.instant('KEY_DELETED'), classes: 'notification-success'});
                            confirmModal.deactivate();
                        } else {
                            notify({message: result.data.Error, classes: 'notification-danger'});
                            confirmModal.deactivate();
                        }
                    }, function(error) {
                        notify({message: error, classes: 'notification-danger'});
                        confirmModal.deactivate();
                    });
                },
                cancel: function() {
                    confirmModal.deactivate();
                }
            }
        });
    };

    /**
     * Mark key as primary (move this one to the top of the list)
     */
    $scope.primary = function(address, key) {
        var order = [];
        var from = address.Keys.indexOf(key);
        var to = 0;

        _.each(address.Keys, function(element, i) { order.push(i + 1); });

        order.splice(to, 0, order.splice(from, 1)[0]);

        networkActivityTracker.track(Key.order({
            AddressID: address.ID,
            Order: order
        }).then(function(result) {
            if (result.data && result.data.Code === 1000) {
                address.Keys.splice(to, 0, address.Keys.splice(from, 1)[0]);
            } else {
                notify({message: result.data.Error, classes: 'notification-danger'});
            }
        }, function(error) {
            notify({message: error, classes: 'notification-danger'});
        }));
    };

    /**
     * Open modal to reactivate key pair
     * @param {Object} address
     * @param {Object} key
     */
    $scope.reactivate = function(address, key) {
        var mailboxPassword = authentication.getPassword();

        reactivateModal.activate({
            params: {
                submit: function(loginPassword, keyPassword) {
                    // Try to decrypt private key with the key password specified
                    pmcw.decryptPrivateKey(key.PrivateKey, keyPassword).then(function(package) {
                        // Encrypt private key with the current mailbox password
                        pmcw.encryptPrivateKey(package, mailboxPassword).then(function(privateKey) {
                            // Update private key
                            Key.private({
                                Password: loginPassword,
                                Keys: [{
                                    ID: key.ID,
                                    PrivateKey: privateKey
                                }]
                            }).then(function(result) {
                                if (result.data && result.data.Code === 1000) {
                                    // Mark key as decrypted
                                    key.decrypted = true;
                                    // Store the package decrypted
                                    authentication.storeKey(address.ID, key.ID, package);
                                    // Close the modal
                                    reactivateModal.deactivate();
                                } else if (result.data && result.data.Error) {
                                    notify({message: result.data.Error, classes: 'notification-danger'});
                                } else {
                                    notify({message: 'Error during the update key request', classes: 'notification-danger'});
                                }
                            }, function(error) {
                                notify({message: 'Error during the update key request', classes: 'notification-danger'});
                            });
                        }, function(error) {
                            notify({message: 'Error during the encryption phase', classes: 'notification-danger'});
                        });
                    }, function(error) {
                        notify({message: 'Wrong key pair password', classes: 'notification-danger'});
                    });
                },
                cancel: function() {
                    reactivateModal.deactivate();
                }
            }
        });
    };

    /**
     * Generate an other key pair
     * @param {Object} address
     */
    $scope.generate = function(address) {
        var title = $translate.instant('GENERATE_KEY');
        var message = $translate.instant('CONFIRM_GENERATE_KEY');
        var mailboxPassword = authentication.getPassword();

        confirmModal.activate({
            params: {
                title: title,
                message: message,
                confirm: function() {
                    pmcw.generateKeysRSA(address.Email, mailboxPassword).then(function(result) {
                        var publicKeyArmored = result.publicKeyArmored;
                        var privateKeyArmored = result.privateKeyArmored;

                        Key.create({
                            AddressID: address.ID,
                            PrivateKey: privateKeyArmored
                        }).then(function(result) {
                            if (result.data && result.data.Code === 1000) {
                                var key = result.data.Key;

                                // Add the new key who become the first key
                                address.Keys.unshift(key);

                                // Decrypt private key with the mailbox password
                                pmcw.decryptPrivateKey(key.PrivateKey, mailboxPassword).then(function(package) {  // Decrypt private key with the mailbox password
                                    // Store the package decrypted
                                    authentication.storeKey(address.ID, key.ID, package);
                                    // Close the confirm modal
                                    confirmModal.deactivate();
                                }, function(error) {
                                    notify({message: error, classes: 'notification-danger'});
                                    confirmModal.deactivate();
                                });
                            } else {
                                notify({message: result.data.Error, classes: 'notification-danger'});
                                confirmModal.deactivate();
                            }
                        }, function(error) {
                            notify({message: error, classes: 'notification-danger'});
                            confirmModal.deactivate();
                        });
                    }, function(error) {
                        notify({message: error, classes: 'notification-danger'});
                        confirmModal.deactivate();
                    });
                },
                cancel: function() {
                    confirmModal.deactivate();
                }
            }
        });
    };
});
