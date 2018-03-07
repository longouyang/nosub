var AWS = require('aws-sdk'),
    _ = require('lodash'),
    minimist = require('minimist'),
    ask = require('./ask'),
    fs = require('fs'),
    convert = require('xml-js'),
    assert = require('assert'),
    crypto = require('crypto');

// translated from https://hackernoon.com/functional-javascript-resolving-promises-sequentially-7aac18c4431e
function SerialPromises(items, taskizer) {
  return items.reduce(
    function(acc, item) {
      return acc.then(function(result) {
        return taskizer(item).then(Array.prototype.concat.bind(result))
      })
    },
    Promise.resolve([]))
}

function SerialPromises2(promisors) {
  return promisors.reduce(
    function(acc, promisor) {
      return acc.then(function(result) {
        return promisor().then(Array.prototype.concat.bind(result))
      })
    },
    Promise.resolve([]))
}

function readCreationData(endpoint) {
  var data = JSON.parse(fs.readFileSync('hit-ids.json'));
  if (!_.has(data, endpoint)) {
    console.error('Error: this HIT hasn\'t been created on ' + endpoint + ' yet');
    process.exit()
  }
  return data[endpoint]
}

// returns an mturk instance for either production or sandbox
// HT https://github.com/aws/aws-sdk-js/issues/1390
var getClient = function(opts) {
  assert.ok(_.includes(['production', 'sandbox'], opts.endpoint),
            'Unknown API endpoint ' + opts.endpoint)

  var endpoint = (opts.endpoint == 'production'
                  ? 'https://mturk-requester.us-east-1.amazonaws.com'
                  : 'https://mturk-requester-sandbox.us-east-1.amazonaws.com');

  console.log('Running on ' + opts.endpoint);

  return new AWS.MTurk(
    {apiVersion: '2017-01-17',
     endpoint: endpoint
    });
}

// TODO? in addition to command-line and stdin interfaces, also allow programmatic access
function create(opts) {
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
      name: 'endpoint',
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
                                           return _.has(opts, q.name) && q.validate(opts[q.name])
                                         }),
      answeredQuestions = questionsPartitioned[0],
      unansweredQuestions = questionsPartitioned[1];

  var noninteractiveAnswers = _.chain(answeredQuestions)
      .map(function(q) { return [q.name, q.transform(opts[q.name])] })
      .fromPairs()
      .value();

  var interactiveAnswers = _.fromPairs(ask.many(unansweredQuestions));

  var answers = _.extend({},noninteractiveAnswers, interactiveAnswers);

  // transform anything passed in via command line

  var externalQuestion =
      `<ExternalQuestion xmlns="http://mechanicalturk.amazonaws.com/AWSMechanicalTurkDataSchemas/2006-07-14/ExternalQuestion.xsd">
  <ExternalURL>${opts.Url}</ExternalURL>
  <FrameHeight>${opts.FrameHeight}</FrameHeight>
</ExternalQuestion>`;

  var allParams = _.extend({}, opts, answers, {Question: externalQuestion})

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

  // TODO: handle qualification requirements

  if (allParams.Batch) {
    createBatch(turkParams, answers.endpoint)
  } else {
    createSingle(turkParams, answers.endpoint)
  }

}

function delay(t, v) {
  return new Promise(function(resolve) {
    setTimeout(resolve.bind(null, v), t)
  });
}

function createBatch(turkParams, endpoint) {
  var mtc = getClient({endpoint: endpoint});

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
      return SerialPromises(batchSizes, function(size) {
        return delay(500).then(
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
                                               _.fromPairs([[endpoint, data]])),
                                      null,
                                      1
                                     ))

    })
}

function createSingle(turkParams, endpoint) {
  var mtc = getClient({endpoint: endpoint});

  mtc.createHIT(turkParams).promise()
    .then(function(data) {
      var hit = data.HIT
      var existingHitIds = fs.existsSync('hit-ids.json') ? JSON.parse(fs.readFileSync('hit-ids.json')) : {}

      fs.writeFileSync('hit-ids.json',
                       JSON.stringify(_.extend({},
                                               existingHitIds,
                                               _.fromPairs([[endpoint, hit]]))))

      console.log('Created HIT ' + hit.HITId)
      // TODO: add preview link
    })
    .catch(function(err) {
      console.log('Error creating HIT')
      console.error(err.message)
    })
}

function HITDownloadResults(HITId, dirName, deanonymize, mtc) {
  var nextDownload = function(nextToken, assnCount) {
    if (typeof assnCount == 'undefined') {
      assnCount = 0
    }

    var requestParams = _.extend({HITId: HITId,
                                  AssignmentStatuses: ['Submitted', 'Approved', 'Rejected']
                                 },
                                 nextToken ? {NextToken: nextToken} : {})

    var hash = crypto.createHash('md5');

    return mtc
      .listAssignmentsForHIT(requestParams)
      .promise()
      .then(function(data) {
        //console.log(`NextToken is ${data.NextToken}`)
        // read the xml inside each assignment, convert to js
        _.each(data.Assignments,
               function(a, i) {
                 var assnNum = assnCount + i + 1;
                 if (_.includes(existingAssignmentIds, a.AssignmentId)) {
                   console.log(`${assnNum} Skipping ${a.AssignmentId}`)
                   return
                 }
                 var metadata = _.omit(a, 'Answer')
                 if (!deanonymize) {
                   var salt = AWS.config.credentials.accessKeyId
                   var digest = crypto.createHash('md5').update(salt + metadata.WorkerId).digest('hex');
                   metadata.WorkerId = digest;
                 }
                 var xmlDoc = a.Answer;
                 var xmlConverted = convert.xml2js(xmlDoc, {compact: true});
                 var pairs = xmlConverted.QuestionFormAnswers.Answer
                     .map(function(e) {
                       var parsedText
                       try {
                         parsedText = JSON.parse(e.FreeText._text)
                       } catch (err) {
                         console.log(`Couldn't parse ${e.QuestionIdentifier} response so left as string: `)
                         console.log(e.FreeText._text)
                         parsedText = e.FreeText._text
                       }

                       return [e.QuestionIdentifier._text, parsedText]
                     })
                 var data = _.extend({}, metadata, {answers: _.fromPairs(pairs)})

                 console.log(`${assnNum} Downloaded ${a.AssignmentId}`)
                 var filename = dirName + a.AssignmentId + '.json';
                 fs.writeFileSync(filename, JSON.stringify(a, null, 1))
               })

        if (assnCount < numSubmitted) {
          return new Promise(function() {
            nextDownload(data.NextToken, assnCount + data.NumResults)
          })
        }
      })
      .catch(function(e) {
        console.log(e)
      })
  }

  var numSubmitted = 0;
  var existingAssignmentIds = _.chain(fs.readdirSync(dirName))
      .filter(function(filename) { return /\.json$/.test(filename) })
      .map(function(filename) { return filename.replace(".json", "")})
      .value()

  console.log(`Getting status of HIT ${HITId}`)

  return mtc
    .getHIT({HITId: HITId})
    .promise()
    .then(function(data) {
      numSubmitted = data.HIT.MaxAssignments - data.HIT.NumberOfAssignmentsAvailable
      if (numSubmitted == 0) {
        console.log('No assignments completed yet.')
      } else {
        console.log(`We have ${existingAssignmentIds.length}/${numSubmitted} assignments`)
      }
      if (numSubmitted == existingAssignmentIds.length) {
        return null
      } else {
        return nextDownload()
      }
    })
    .catch(function(err) {
      console.log('Error:', err)
    })

}

function download(creationData, deanonymize, endpoint) {
  var mtc = getClient({endpoint: endpoint});
  var dirName = endpoint + '-results/'
  try {
    fs.readdirSync(dirName)
  } catch(err) {
    fs.mkdirSync(dirName);
  }

  var isSingleMode = !_.isArray(creationData);

  if (isSingleMode) {
    var HITId = creationData.HITId;
    return HITDownloadResults(HITId, dirName, deanonymize, mtc)
  } else {
    var HITIds = _.map(creationData, 'HIT.HITId')

    return SerialPromises(HITIds, function(id) {
      return HITDownloadResults(id, dirName, deanonymize, mtc)
    })
  }
}

function HITAddTime(HITId, seconds, mtc) {
  var newDate;

  return mtc.getHIT({HITId: HITId}).promise()
    .then(function(data) {
      var oldExpiration = Math.max(Date.now(),
                                   (new Date(data.HIT.Expiration)).getTime());
      var newExpiration = oldExpiration + (seconds * 1000);
      newDate = new Date(newExpiration);
      return mtc.updateExpirationForHIT({HITId: HITId, ExpireAt: newDate}).promise()
    })
    .then(function(data) {
      // aws returns an empty response, so ignore data argument
      console.log('New expiration is ' + newDate.toString())
    })
    .catch(function(err) {
      console.log(err)
    })
}

function addTime(creationData, seconds, endpoint) {
  var mtc = getClient({endpoint: endpoint});

  var isSingleMode = !_.isArray(creationData);
  if (isSingleMode) {
    return HITAddTime(creationData.HITId, seconds, mtc)
  } else {
    var HITIds = _.map(creationData, 'HIT.HITId')

    return SerialPromises(HITIds, function(HITId) {
      return mtc.getHIT({HITId: HITId}).promise()
    }).then(function(_hits) {
      var hits = _.map(_hits, 'HIT');
      var inProgressHITs = _.filter(hits,
                                    function(h) {
                                      return h.NumberOfAssignmentsCompleted < h.MaxAssignments
                                    })

      return SerialPromises(inProgressHITs,
                            function(h) {
                              return HITAddTime(h.HITId, seconds, mtc)
                            })
    })

  }
}

function HITAddAssignments(HITId, assignments, mtc) {
  return mtc.createAdditionalAssignmentsForHIT({HITId: HITId,
                                                NumberOfAdditionalAssignments: assignments
                                               }).promise().then(function(data) {
                                                 console.log(`Added ${assignments} assignments to HIT ${HITId}`)
                                               })
}

// testing: rm hit-ids.json; node ../src/index.js create --assignments 30 --duration "2 days"; gsleep 2s; node ../src/index.js add 29 assignments
function addAssignments(creationData, assignments, endpoint) {
  var mtc = getClient({endpoint: endpoint});
  var isSingleMode = !_.isArray(creationData);
  if (isSingleMode) {
    return HITAddAssignments(creationData.HITId, assignments, mtc)
  } else {
    // first find the hit that has fewer than 9 assignments (if one exists)
    // and top it up to 9
    var hits = _.map(creationData, 'HIT');
    var topupHit = _.find(hits, function(h) {
      return h.MaxAssignments < 9
    })
    var topUpAmount = 0;

    var promisors = [];

    if (topupHit) {
      console.log(`topping up`, topupHit.HITId)
      topUpAmount = 9 - topupHit.MaxAssignments;
      promisors.push(
        function() {
          return HITAddAssignments(topupHit.HITId, topUpAmount, mtc)
          // wait a little bit and get new metadata for topped up hit
          // so we can update our local information about the hit
            .then(delay(500))
            .then(function() {return mtc.getHIT({HITId: topupHit.HITId}).promise() })
        }
      )
    }

    // then create new batches of 9 and a spillover batch if necessary
    var n = assignments - topUpAmount,
        numBatches = Math.ceil(n / 9),
        batchSizes = _.map(_.range(numBatches),
                           function(i) {
                             return i < (numBatches - 1) ? 9 :
                               (n % 9 == 0 ? 9 : n % 9)
                           });

    promisors = promisors.concat(batchSizes.map(function(size, i) {
      return function() {
        return mtc.createHITWithHITType({
          HITTypeId: creationData[0].HIT.HITTypeId,
          MaxAssignments: size,
          LifetimeInSeconds: "20000", // TODO
          Question: creationData[0].HIT.Question
        }).promise().then(function(data) {
          console.log('Created batch ' + data.HIT.HITId)
          return data
        })
      }
    }))


    SerialPromises2(promisors).then(function(modifiedHits) {
      var modifiedHitIds = _.map(modifiedHits, 'HIT.HITId'),
          unmodifiedHits = _.reject(creationData,
                                    function(x) {return _.includes(modifiedHitIds, x.HIT.HITId)})

      var existingData = fs.existsSync('hit-ids.json') ? JSON.parse(fs.readFileSync('hit-ids.json')) : {}

      fs.writeFileSync('hit-ids.json',
                       JSON.stringify(_.extend({},
                                               existingData,
                                               _.fromPairs([[endpoint, unmodifiedHits.concat(modifiedHits)]])),
                                      null,
                                      1
                                     ))

    })
  }
}

function balance(endpoint) {
  var HITId = readCreationData(endpoint).HITId;
  var mtc = getClient({endpoint: endpoint});

  mtc.getAccountBalance({})
    .promise()
    .then(function(data) {
      console.log(`Available balance is ${data.AvailableBalance}`)
    })
    .catch(function(err) {
      console.error('Error: ' + err)
    })
}

// TODO: clean up output
function statusSingle(HITId, endpoint) {
//  var HITId = readCreationData(endpoint).HITId;

  var mtc = getClient({endpoint: endpoint});

  return mtc
    .getHIT({HITId: HITId})
    .promise()
    .then(function(data) {
      console.log(data)
    })
    .catch(function(err) {
      console.error(err)
    })
}

function statusBatch(endpoint) {
  var HITIds = _.map(readCreationData(endpoint), 'HIT.HITId')
  SerialPromises(HITIds, function(HITId) { return statusSingle(HITId, endpoint)})
}


module.exports = {
  create: create,
  download: download,
  addTime: addTime,
  addAssignments: addAssignments,
  balance: balance,
  status: statusBatch
}
