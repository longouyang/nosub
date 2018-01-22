var readlineSync = require('readline-sync');
var _ = require('lodash')

function one(_opts) {
  var opts = _.defaults(_opts || {},
                        {message: '',
                         validate: function() { return true },
                         invalidMessage: 'Invalid input',
                         transform: function(x) { return x }
                        })

  // TODO: detect control-D for exiting
  while(true) {
    var response = readlineSync.question(opts.message + '\n> ')
    if (opts.validate(response)) {
      return [opts.name, opts.transform(response)]
    } else {
      console.log(opts.invalidMessage)
    }
  }
}

function many(specs) {
  return specs.map(one)
}


module.exports = {one: one, many: many};
