var AWS = require('aws-sdk'),
    _ = require('lodash');

// TODO: inquirer has issues:
// - displays ANSI codes inside emacs shell.
// - is kinda heavyweight
// - does filtering before validation
// - erases the prompt upon invalid input
// i should roll my own implementation using readline and promises.
var inquirer = require('inquirer');

AWS.config.update({region:'us-east-1'});

var unitsToSeconds = {second: 1, minute: 60, hour: 3600, day: 86400, week: 604800};

// converts a string input to a number of seconds
function extractDuration(x) {
  var match = /(\d+)\s*(second|minute|hour|day|week)/.exec(x);
  var numUnits = parseFloat(match[1]),
      unit = match[2];

  return numUnits * unitsToSeconds[unit];
}

function validateDuration(x) {
  return /\d+\s*(second|minute|hour|day|week)s?/.test(x)
}


var mturk = new AWS.MTurk({apiVersion: '2017-01-17'});
// interactive version
function create(_options) {
  var options = _.defaults(options || {},
                           {environment: 'sandbox',
                            batch: false
                           });

  var prompt = inquirer.createPromptModule();

  var promptSchema = [
    {
      prefix: '',
      suffix: '\n>',
      name: 'assignments',
      type: 'input',
      message: 'How many assignments do you want to run?',
      // NB: filter runs before validate :/
      filter: function(x) {
        return parseInt(x)
      },
      validate: function(x) {
        return _.isInteger(x) ? true : 'Answer must be a number'
      }
    },
    {
      prefix: '',
      suffix: '\n>',
      name: 'duration',
      type: 'input',
      message: 'How many seconds do you want to run the HIT?\n You can give an answer in seconds, minutes, hours, days, or weeks.\n (You can always add more time using cosub add)',
      validate: function(x) {
        return validateDuration(x) ? true : 'invalid'
      }
    }
  ];

  var getAccountBalance = mturk.getAccountBalance({}).promise();

  prompt(promptSchema)
    .then(function() { return getAccountBalance })
    .then(function(res) {
      console.log(arguments)
    })


  // var afterPrompt = function(err, result) {
  //   console.log(result)
  // }

  // prompt.get(schema, afterPrompt)

  // mturk.getAccountBalance({}, function(err, data) {
  //   if (err) console.log(err, err.stack); // an error occurred
  //   else     console.log(data);           // successful response
  // });
}

var args = process.argv.slice(2);

var action = args[0];

if (action == 'create') {
  create()
}
