var assert = require('assert')
var AWS = require('aws-sdk')
var _ = require('lodash')
var ask = require('./ask')
var util = require('./util')
var fs = require('fs')
var promiseUtils = require('./promise-utils')
var quals = require('./quals')

var SerialPromises = promiseUtils.SerialPromises,
  SerialPromises2 = promiseUtils.SerialPromises2;

function delay(t, v) {
  return new Promise(function (resolve) {
    setTimeout(resolve.bind(null, v), t)
  });
}

var getCost = require('./getCost');

// steps:
// - check that we haven't already uploaded
// - ask for duration and assignments
// - initialize hit params
// - fill in qualifications in hit params
// - check that we have enough funds
// - upload
async function upload(opts) {
  var mtc = getClient(opts)

  // check that we haven't already uploaded
  try {
    var creationData = JSON.parse(fs.readFileSync('hit-ids.json'));
    if (_.has(creationData, opts.endpoint)) {
      console.error(`You've already uploaded this HIT to ${opts.endpoint}`)
      process.exit()
    }
  } catch (e) {
  }

  // ask for durations and assignments
  var answers = askAssignmentsAndDuration(opts);

  // initialize parameters for createHIT request to AWS
  var createHITParams = makeCreateHITParams(opts, answers)


  // map qualification names to ids and install in request parameters
  var quals = await lookupQualificationNames(opts, answers, createHITParams);
  createHITParams.QualificationRequirements = _.map(quals, function (q) { return _.omit(q, 'Name') });


  var totalCost = await getCost(opts, answers.assignments, quals);
  console.log('Cost will be $' + totalCost)


  // check that we have enough funds
  var balanceData = await mtc.getAccountBalance({}).promise()
  var userBalance = parseFloat(balanceData.AvailableBalance)
  console.log('Account balance is $' + userBalance)
  if (totalCost > userBalance) {
    console.error('You don\'t have enough funds')
    process.exit()
  }

  // fire request to AWS
  if (opts.Batch) {
    await uploadBatch(createHITParams, opts.endpoint)
  } else {
    await uploadSingle(createHITParams, opts.endpoint)
  }

}

async function uploadBatch(turkParams, endpoint) {
  var mtc = getClient({ endpoint: endpoint })
  var metadata = {};
  var domain = endpoint == 'sandbox' ? 'workersandbox.mturk.com' : 'worker.mturk.com';
  var requestParams = _.omit(turkParams, 'LifetimeInSeconds', 'Question', 'MaxAssignments');

  try {
    var response1 = await mtc.createHITType(requestParams).promise();
  } catch (err) {
    console.log('Error')
    console.error(err.message)
    process.exit()
  }

  console.log(`Created HIT Type ${response1.HITTypeId}`)

  var n = parseInt(turkParams.MaxAssignments),
    numBatches = Math.ceil(n / 9),
    batchSizes = _.map(_.range(numBatches),
      function (i) {
        return i < (numBatches - 1) ? 9 :
          (n % 9 == 0 ? 9 : n % 9)
      })

  var batchData = []
  try {
    for (const batchSize of batchSizes) {
      await delay(500);
      var params = {
        HITTypeId: response1.HITTypeId,
        MaxAssignments: batchSize,
        LifetimeInSeconds: turkParams.LifetimeInSeconds,
        Question: turkParams.Question
      }
      var response = await mtc.createHITWithHITType(params).promise();
      batchData.push(response)
      console.log(`Created batch ${response.HIT.HITId}`)
      console.log(`- Preview link: https://${domain}/mturk/preview?groupId=${response.HIT.HITGroupId}`)

    }

  } catch (err) {
    console.log('Error')
    console.error(err.message)
    process.exit()
  }

  var existingData = fs.existsSync('hit-ids.json') ? JSON.parse(fs.readFileSync('hit-ids.json')) : {}

  fs.writeFileSync('hit-ids.json',
    JSON.stringify(_.extend({},
      existingData,
      _.fromPairs([[endpoint, batchData]])),
      null,
      1
    ))
  return batchData
}

async function uploadSingle(turkParams, endpoint) {
  var mtc = getClient({ endpoint: endpoint })
  try {
    var response = await mtc.createHIT(turkParams).promise()
  } catch (err) {
    console.log('Error creating HIT')
    console.error(err.message)
  }

  var hit = response.HIT
  var existingHitIds = fs.existsSync('hit-ids.json') ? JSON.parse(fs.readFileSync('hit-ids.json')) : {}

  fs.writeFileSync('hit-ids.json',
    JSON.stringify(_.extend({},
      existingHitIds,
      _.fromPairs([[endpoint, hit]]))))

  var domain = endpoint == 'sandbox' ? 'workersandbox.mturk.com' : 'worker.mturk.com'
  console.log(`Uploaded. HIT ID is ${hit.HITId}`)
  console.log(`Preview link: https://${domain}/mturk/preview?groupId=${response.HIT.HITGroupId}`)
}


var getClient = function (opts) {
  assert.ok(_.includes(['production', 'sandbox'], opts.endpoint),
    'Unknown API endpoint ' + opts.endpoint)

  var endpoint = (opts.endpoint == 'production'
    ? 'https://mturk-requester.us-east-1.amazonaws.com'
    : 'https://mturk-requester-sandbox.us-east-1.amazonaws.com');

  if (!opts.quiet) {
    console.log(`Running on ${opts.endpoint}`);
  }

  return new AWS.MTurk(
    {
      apiVersion: '2017-01-17',
      endpoint: endpoint
    })
}

function askAssignmentsAndDuration(opts) {
  var allQuestions = [
    {
      name: 'endpoint',
      message: 'Do you want to run on production or sandbox?',
      validate: function (x) {
        return ('production'.indexOf(x) > -1 || 'sandbox'.indexOf(x) > -1) ? true : 'Type p for production and s for sandbox'
      },
      transform: function (x) {
        return 'production'.indexOf(x) > -1 ? 'production' : 'sandbox'
      }
    },
    {
      name: 'assignments',
      message: 'How many assignments do you want to run?',
      validate: function (x) {
        return _.isInteger(parseInt(x)) ? true : 'Answer must be a number'
      },
      transform: function (x) {
        return parseInt(x)
      }
    },
    {
      name: 'duration',
      message: ['How long do you want to run the HIT?',
        'You can answer in seconds, minutes, hours, days, or weeks and you can always add more time using nosub add.'].join('\n'),
      validate: function (x) {
        return util.validateDuration(x) ? true : 'Invalid duration'
      },
      transform: function (x) {
        return util.extractDuration(x)
      }
    }
  ];

  var questionsPartitioned = _.partition(
    allQuestions,
    function (q) {
      return _.has(opts, q.name) &&
        (!_.has(q, 'validate') || q.validate(opts[q.name]) === true)
    })
  var answeredQuestions = questionsPartitioned[0];
  var unansweredQuestions = questionsPartitioned[1];

  var noninteractiveAnswers = _.chain(answeredQuestions)
    .map(function (q) { return [q.name, q.transform(opts[q.name])] })
    .fromPairs()
    .value();

  var interactiveAnswers = _.fromPairs(ask.many(unansweredQuestions));

  var answers = _.extend({}, noninteractiveAnswers, interactiveAnswers);
  return answers;
}

// make the parameters for the mtc.createHIT call
// this requires renaming some keys from settings.json
// and combining with answered assignments and duration
function makeCreateHITParams(opts, answers) {
  var externalQuestion = `<ExternalQuestion xmlns="http://mechanicalturk.amazonaws.com/AWSMechanicalTurkDataSchemas/2006-07-14/ExternalQuestion.xsd">
  <ExternalURL>${opts.Url}</ExternalURL>
  <FrameHeight>${opts.FrameHeight}</FrameHeight>
</ExternalQuestion>`;

  var allParams = _.extend({}, opts, answers, { Question: externalQuestion })

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
    var oldKeys = _.keys(dict);
    // if we end up calling this on, say, a number, string, or boolean, just return the value
    if (oldKeys.length == 0) {
      return dict
    }
    var newKeys = _.map(oldKeys, renameOldKey),
      oldValues = _.values(dict),
      newValues = _.map(oldValues,
        function (v) {
          return (_.isArray(v)
            ? _.map(v, renameOldKeys)
            : (_.isObject(v) ? renameOldKeys(v) : v))
        })

    return _.chain(newKeys).zip(newValues).fromPairs().value()
  }

  var params = _.pick(renameOldKeys(allParams),
    ['Title', 'Description', 'Keywords', 'AssignmentDurationInSeconds',
      'AutoApprovalDelayInSeconds', 'LifetimeInSeconds', 'Reward',
      'QualificationRequirements', 'Question', 'MaxAssignments'
    ]);
  params.AssignmentDurationInSeconds = util.extractDuration(params.AssignmentDurationInSeconds)
  params.AutoApprovalDelayInSeconds = util.extractDuration(params.AutoApprovalDelayInSeconds)
  params.Reward = params.Reward + ""

  return params;
}

const premiumQualifications = require('./premium-qualifications');
const premiumQualificationNames = _.map(premiumQualifications, 'name');


async function lookupQualificationNames(opts, answers, params) {
  var endpoint = answers.endpoint
  var mtc = getClient({ endpoint: endpoint, quiet: true })
  var qualNamesToIds = quals.namesToIds[endpoint];
  var withIds = []
  for (var qr of params.QualificationRequirements) {
    if (_.includes(quals.systemQualNames, qr.Name)) {
      var data = _.chain(qr)
        //.omit('Name')
        .extend({ QualificationTypeId: qualNamesToIds[qr.Name] })
        .value()
      console.log('Added premium qualification for [' + qr.Name + ']: ' + qualNamesToIds[qr.Name])
      withIds.push(data)
    } else if (_.includes(premiumQualificationNames, qr.Name)) {

      const premiumLookup = _.find(premiumQualifications, { 'name': qr.Name });
      const key = endpoint + 'Id' // productionId or sandboxId
      const qualTypeId = premiumLookup[key];

      withIds.push(_(qr)
        //.omit('Name')
        .extend({ QualificationTypeId: qualTypeId })
        .value())

      console.log('Added premium qualification for [' + qr.Name + ']: ' + qualTypeId)


    } else {

      var requestParams = {
        MustBeRequestable: false,
        MustBeOwnedByCaller: true
      }
      var response = await mtc.listQualificationTypes(requestParams).promise()
      var serverQuals = response.QualificationTypes;
      var matchingServerQual = _.find(serverQuals, { Name: qr.Name })
      if (matchingServerQual) {
        withIds.push(_(qr)
          //.omit('Name')
          .extend({ QualificationTypeId: matchingServerQual.QualificationTypeId })
          .value())
        console.log('Added custom qualification for [' + qr.Name + ']: ' + matchingServerQual.QualificationTypeId)
      } else {
        var foundServerNames = _.map(serverQuals, 'Name')
        console.error(`Error: No custom qualification with name ${qr.Name} found on ${endpoint}`)
        console.error(`(Names found on server: ${foundServerNames.join(', ')})`)
        process.exit()
      }
    }
  }
  return withIds
}

module.exports = upload
