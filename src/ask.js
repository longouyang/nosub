var readline = require('readline');
var readlineSync = require('readline-sync');
var _ = require('lodash')

function askOnePromise(_opts) {
  var opts = _.defaults(_opts || {},
                        {message: '',
                         validate: function() { return true },
                         invalidMessage: 'Invalid input',
                         transform: function(x) { return x }
                        })

  // var resolve = function(x) {
  //   console.log(arguments)
  // }

  // var reject = function() {
  //   ask(_opts)
  // }

  return new Promise(function(resolve, reject) {

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    rl.question(opts.message, (answer) => {
      // TODO: Log the answer in a database
      //console.log(`Thank you for your valuable feedback: ${answer}`);
      rl.close();

      if (opts.validate(answer)) {
        resolve(opts.transform(answer));
      } else {
        console.log(opts.invalidMessage)
        resolve(askOne(_opts))
      }
    });

  })

}

function askManyPromise(specs) {

  var answers = [];

  //var promises = specs.map(askOne);
  return specs.reduce(function(acc, spec) {
    return acc.then(function(){ return askOne(spec).then(function(val) {
      answers.push(val);
    }) } )
  }, Promise.resolve())
    .then(function() {
      return answers
    })
}

function askOne(_opts) {
  var opts = _.defaults(_opts || {},
                        {message: '',
                         validate: function() { return true },
                         invalidMessage: 'Invalid input',
                         transform: function(x) { return x }
                        })

  while(true) {
    var response = readlineSync.question(opts.message)
    if (opts.validate(response)) {
      return opts.transform(response)
    } else {
      console.log(opts.invalidMessage)
    }
  }
}

function askMany(specs) {
  return specs.map(askOne)
}


module.exports = {askOne: askOne, many: askMany};
