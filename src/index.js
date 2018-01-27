var AWS = require('aws-sdk'),
    _ = require('lodash'),
    minimist = require('minimist'),
    ask = require('./ask'),
    fs = require('fs');

AWS.config.update({region:'us-east-1'});

// returns an mturk instance for either production or sandbox
// HT https://github.com/aws/aws-sdk-js/issues/1390
var getClient = function(_opts) {
  var opts = _.defaults(_opts || {},
                        {environment: 'sandbox'})

  var endpoint = (opts.environment == 'production'
                  ? 'https://mturk-requester.us-east-1.amazonaws.com'
                  : 'https://mturk-requester-sandbox.us-east-1.amazonaws.com');

  //console.log('endpoint is ' + endpoint);

  return new AWS.MTurk(
    {apiVersion: '2017-01-17',
     endpoint: endpoint
    });
}

// TODO? in addition to command-line and stdin interfaces, also allow programmatic access
function create(settings) {
  // TODO: if we already created this hit (in non-batch-mode, don't allow cosub create)

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

  var allQuestions = [
    {
      name: 'environment',
      message: 'Do you want to run on production or sandbox?',
      validate: function(x) {
        return ('production'.indexOf(x) > -1 || 'sandbox'.indexOf(x) > -1) ? true : 'Type p for production and s for sandbox'
      },
      transform: function(x) {
        return 'production'.indexOf(x) > -1 ? 'production' : 'sandbox'
      }
    },
    {
      name: 'assignments',
      message: 'How many assignments do you want to run?',
      validate: function(x) {
        return _.isInteger(x) ? true : 'Answer must be a number'
      },
      transform: function(x) {
        return parseInt(x)
      }
    },
    {
      name: 'duration',
      message: ['How long do you want to run the HIT?',
                'You can give an answer in seconds, minutes, hours, days, or weeks.',
                '(You can always add more time using cosub add)'].join('\n'),
      validate: function(x) {
        return validateDuration(x) ? true : 'Invalid duration'
      },
      transform: function(x) {
        return extractDuration(x)
      }
    }
  ];

  var questionsPartitioned = _.partition(allQuestions,
                                         function(q) {
                                           return _.has(argv, q.name) && q.validate(argv[q.name])
                                         }),
      answeredQuestions = questionsPartitioned[0],
      unansweredQuestions = questionsPartitioned[1];

  var noninteractiveAnswers = _.chain(answeredQuestions)
      .map(function(q) { return [q.name, q.transform(argv[q.name])] })
      .fromPairs()
      .value();

  var interactiveAnswers = _.fromPairs(ask.many(unansweredQuestions));

  var answers = _.extend({},noninteractiveAnswers, interactiveAnswers);

  // transform anything passed in via command line

  var externalQuestion =
`<ExternalQuestion xmlns="http://mechanicalturk.amazonaws.com/AWSMechanicalTurkDataSchemas/2006-07-14/ExternalQuestion.xsd">
  <ExternalURL>${settings.Url}</ExternalURL>
  <FrameHeight>${settings.FrameHeight}</FrameHeight>
</ExternalQuestion>`;

  var allParams = _.extend({}, settings, answers, {Question: externalQuestion})

  var renames = {
    'duration': 'LifetimeInSeconds',
    'assignments': 'MaxAssignments',
    'AssignmentDuration': 'AssignmentDurationInSeconds',
    'AutoApprovalDelay': 'AutoApprovalDelayInSeconds'
  };

  function renameOldKey(_k) {
    var key = _.has(renames, _k) ? renames[_k] : _k;
    return key
  }

  function renameOldKeys(dict) {
    var oldKeys = _.keys(dict),
        newKeys = _.map(oldKeys, renameOldKey),
        oldValues = _.values(dict),
        newValues = _.map(oldValues,
                          function(v) {
                            return (_.isArray(v)
                                    ? _.map(v, renameOldKeys)
                                    : (_.isObject(v) ? renameOldKeys(v) : v)) })

    return _.chain(newKeys).zip(newValues).fromPairs().value()
  }

  var turkParams = _.pick(renameOldKeys(allParams),
                          ['Title', 'Description', 'Keywords', 'AssignmentDurationInSeconds',
                           'AutoApprovalDelayInSeconds', 'LifetimeInSeconds', 'Reward',
                           'QualificationRequirements', 'Question', 'MaxAssignments'
                          ]);
  turkParams.AssignmentDurationInSeconds = extractDuration(turkParams.AssignmentDurationInSeconds)
  turkParams.AutoApprovalDelayInSeconds = extractDuration(turkParams.AutoApprovalDelayInSeconds)
  turkParams.Reward = turkParams.Reward + ""

  if (allParams.Batch) {
    createBatch(turkParams, answers.environment)
  } else {
    createSingle(turkParams, answers.environment)
  }

}

function delay(t, v) {
   return new Promise(function(resolve) {
       setTimeout(resolve.bind(null, v), t)
   });
}

function createBatch(turkParams, environment) {
  var mtc = getClient({environment: environment});

  var metadata = {};

  mtc.createHITType(_.omit(turkParams, 'LifetimeInSeconds', 'Question', 'MaxAssignments')).promise()
    .then(function(data) {
      console.log('Created HIT Type ' + data.HITTypeId)

      var n = parseInt(turkParams.MaxAssignments),
          numBatches = Math.ceil(n / 9),
          batchSizes = _.map(_.range(numBatches),
                             function(i) {
                               return i < (numBatches - 1) ? 9 :
                                 (n % 9 == 0 ? 9 : n % 9)
                             })

      console.log('Created HITs:');
      var promises = batchSizes.map(function(size, i) {
        return delay(i * 500).then(
          function() {
            return mtc.createHITWithHITType({
              HITTypeId: data.HITTypeId,
              MaxAssignments: size,
              LifetimeInSeconds: turkParams.LifetimeInSeconds,
              Question: turkParams.Question
            }).promise().then(function(dat) {
              console.log(dat.HIT.HITId)
              return dat
            })
          }
        )
      })
      return Promise.all(promises)
    })
    .catch(function(err) {
      console.log('Error')
      console.error(err.message)
    })
    .then(function(data) {
      var existingData = fs.existsSync('hit-ids.json') ? JSON.parse(fs.readFileSync('hit-ids.json')) : {}

      fs.writeFileSync('hit-ids.json',
                       JSON.stringify(_.extend({},
                                               existingData,
                                               _.fromPairs([[environment, data]])),
                                      null,
                                      1
                                     ))

    })
}

function createSingle(turkParams, environment) {
  var mtc = getClient({environment: environment});

  mtc.createHIT(turkParams).promise()
    .then(function(data) {
      var hit = data.HIT
      var existingHitIds = fs.existsSync('hit-ids.json') ? JSON.parse(fs.readFileSync('hit-ids.json')) : {}

      fs.writeFileSync('hit-ids.json',
                       JSON.stringify(_.extend({},
                                               existingHitIds,
                                               _.fromPairs([[environment, hit]]))))

      console.log('Created HIT ' + hit.HITId)
    })
    .catch(function(err) {
      console.log('Error creating HIT')
      console.error(err.message)
    })
}

function getBalance(_options) {
  // TODO: sandbox versus production
  var getAccountBalance = mturk.getAccountBalance({}).promise();
  getAccountBalance.then(function(bal) {
    console.log(bal)
  })
}

var args = process.argv.slice(2);
var argv = require('minimist')(process.argv.slice(2));
var action  = argv['_'];

if (action == 'create') {
  var settings = JSON.parse(fs.readFileSync(argv['hit-file'], 'utf8'));

  if (!_.has(settings, "_cosubSpecVersion") || settings._cosubSpecVersion != 2) {
    console.error("Error reading settings file -- you may be reusing a settings file from a previous version of cosub")
    process.exit()
  }

  // TODO: handle error
  create(settings)
}

if (action == 'balance') {
  getBalance()
}

function init() {
}

if (action == 'init') {
  init()
}
