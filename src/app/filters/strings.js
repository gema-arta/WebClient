angular.module("proton.filters.strings", [])

.filter("capitalize", function() {
  return function(input) {
    return _.string.capitalize(input);
  };
})

.filter("humanSize", function () {
  return function (input) {
    var size;
    if (_.isNumber(input)) {
      size = input;
    } else if (_.isNaN(size = parseInt(input))) {
      size = 0;
    }

    if (size < 1024) {
      return size + " B";
    } else if (size < 1048576) {
      return Math.round(size*10/1024)/10 + " kB";
    } else {
      return Math.round(size*10/1048576)/10 + " MB";
    }
  };
})

.filter("contrast", function () {
  return function (input, character) {
    if (!input) {
      return input;
    }

    var split = input.split(character);

    if (split.length == 1) {
      return "*" + input + "*";

    } else {
      if (character == '<') {
        character = '&lt;';
        split[1].replace('>', '&gt;');
      }

      return "*" + _.string.trim(split[0]) + "* " + character + split[1];
    }
  };
});
