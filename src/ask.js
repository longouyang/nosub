var readlineSync = require('readline-sync');
var _ = require('lodash')

function one(_opts) {
  var opts = _.defaults(_opts || {},
                        {message: '',
                         validate: function() { return true },
                         transform: function(x) { return x }
                        })

  while(true) {
    var response = readlineSync.question(opts.message + '\n> ')
    var validatorValue = opts.validate(response)
    if (validatorValue === true) {
      return [opts.name, opts.transform(response)]
    } else if (validatorValue === false) {
      console.log('Invalid input')
    } else {
      console.log(validatorValue)
    }
  }
}

function many(specs) {
  return specs.map(one)
}


module.exports = {one: one, many: many};
