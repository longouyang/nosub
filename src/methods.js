var AWS = require('aws-sdk'),
    _ = require('lodash'),
    minimist = require('minimist'),
    ask = require('./ask'),
    fs = require('fs'),
    convert = require('xml-js'),
    assert = require('assert'),
    crypto = require('crypto'),
    cTable = require('console.table'),
    promiseUtils = require('./promise-utils'),
    quals = require('./quals');

var SerialPromises = promiseUtils.SerialPromises,
    SerialPromises2 = promiseUtils.SerialPromises2;

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

  if (!opts.quiet) {
    console.log(`Running on ${opts.endpoint}`);
  }

  return new AWS.MTurk(
    {apiVersion: '2017-01-17',
     endpoint: endpoint
    });
}

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


// testing qualification entry:
// node ../src/index.js init --Url foo.com --Title bar --Description baz --Keywords qux --Batch s --FrameHeight 450 --AssignmentDuration '45 minutes' --AutoApprovalDelay '5 minutes' --Reward 0.75
function init(opts) {
  var allQuestions = [
    {
      name: 'Url',
      message: 'What is your task URL?',
      validate: function(x) {
        if (x.length == 0) return false
        if (x.indexOf('http://') > -1) return 'http URLs are not allowed; use https'
        return true
      },
      transform: function(x) {
        if (x.indexOf('https://') == 0) {
          return x
        } else {
          return 'https://' + x
        }
      }
    },
    {
      name: 'Title',
      message: 'What is the title of your HIT?',
      validate: function(x) {
        return x.length > 0
      }
    },
    {
      name: 'Description',
      message: 'What is the description of your HIT?',
      validate: function(x) {
        return x.length > 0
      }
    },
    {
      name: 'Keywords',
      message: 'Provide some keywords for the HIT:',
      validate: function(x) {
        return x.length > 0
      }
    },
    {
      name: 'Batch',
      message: 'Do you want to run in (b)atch or (s)ingle mode?',
      validate: function(x) {
        return ('batch'.indexOf(x) > -1 || 'single'.indexOf(x) > -1) ? true : 'Type b for batch and s for single'
      },
      transform: function(x) {
        return 'batch'.indexOf(x) > -1 ? true : false
      }
    },
    {
      name: 'FrameHeight',
      message: 'What frame height do you want?',
      validate: function(x) {
        return _.isInteger(parseInt(x)) ? true : 'Height must be an integer'
      },
      transform: function(x) {
        return parseInt(x)
      }
    },
    {name: "AssignmentDuration",
     message: "How long will a worker have to complete your HIT?\nYou can answer in seconds, minutes, hours, days, or weeks.",
     validate: validateDuration
     // NB: not transformed
    },
    // TODO: enter Infinity for no AutoApprovalDelay
    {name: "AutoApprovalDelay",
     message: 'After how long should unreviewed assignments be automatically approved?\nYou can answer in seconds, minutes, hours, days, or weeks.',
     validate: validateDuration
     // NB: not transformed
    },
    {name: "Reward",
     message: 'How much you will pay each worker (in dollars)?',
     validate: function(_x) {
       // if value comes from command line args, it'll be a number, not a string
       var x = _x + '';
       return _.isNumber(parseFloat(x.replace('$',''))) ? true : 'Reward must be a number'
     },
     // NB: not transformed to a string, only strip currency indicator
     transform: function(_x) {
       var x = parseFloat(_x.replace('$',''));
       return x + '';
     }
    }
  ];

  var questionsPartitioned = _.partition(
    allQuestions,
    function(q) {
      return _.has(opts, q.name) &&
        (!_.has(q, 'validate') || q.validate(opts[q.name]) === true)
    })
  var answeredQuestions = questionsPartitioned[0];
  var unansweredQuestions = questionsPartitioned[1];

  var noninteractiveAnswers = _.chain(answeredQuestions)
      .map(function(q) { return [q.name,
                                 (!_.has(q, 'transform')
                                  ? opts[q.name] :
                                  q.transform(opts[q.name]))] })
      .fromPairs()
      .value();

  var interactiveAnswers = _.fromPairs(ask.many(unansweredQuestions));
  var answers = _.extend({"_cosubSpecVersion":2},noninteractiveAnswers, interactiveAnswers);

  var qrs = quals.ask();
  _.extend(answers, {QualificationRequirements: qrs})
  // TODO: read qualifications string from noninteractive specification (use & as a delimiter)

  fs.writeFileSync('settings.json', JSON.stringify(answers, null, 1))
  console.log('Wrote to settings.json')
}

// TODO? in addition to command-line and stdin interfaces, also allow programmatic access
function upload(opts) {
  try {
    var creationData = JSON.parse(fs.readFileSync('hit-ids.json'));
    if (_.has(creationData, opts.endpoint)) {
      console.error(`You've already uploaded this HIT to ${opts.endpoint}`)
      process.exit()
    }
  } catch(e) {

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
        return _.isInteger(parseInt(x)) ? true : 'Answer must be a number'
      },
      transform: function(x) {
        return parseInt(x)
      }
    },
    {
      name: 'duration',
      message: ['How long do you want to run the HIT?',
                'You can answer in seconds, minutes, hours, days, or weeks and you can always add more time using nosub add.'].join('\n'),
      validate: function(x) {
        return validateDuration(x) ? true : 'Invalid duration'
      },
      transform: function(x) {
        return extractDuration(x)
      }
    }
  ];

  var questionsPartitioned = _.partition(
    allQuestions,
    function(q) {
      return _.has(opts, q.name) &&
        (!_.has(q, 'validate') || q.validate(opts[q.name]) === true)
    })
  var answeredQuestions = questionsPartitioned[0];
  var unansweredQuestions = questionsPartitioned[1];

  var noninteractiveAnswers = _.chain(answeredQuestions)
      .map(function(q) { return [q.name, q.transform(opts[q.name])] })
      .fromPairs()
      .value();

  var interactiveAnswers = _.fromPairs(ask.many(unansweredQuestions));

  var answers = _.extend({},noninteractiveAnswers, interactiveAnswers);

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
    var oldKeys = _.keys(dict);
    // if we end up calling this on, say, a number, string, or boolean, just return the value
    if (oldKeys.length == 0) {
      return dict
    }
    var newKeys = _.map(oldKeys, renameOldKey),
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

  var endpoint = answers.endpoint;
  var mtc = getClient({endpoint: endpoint, quiet: true})
  // name to id mapping depends on endpoint
  var qualNamesToIds = quals.namesToIds[endpoint];

  // look up qualification ids from qualification names
  // TODO: handle pagination
  SerialPromises(turkParams.QualificationRequirements,
                 function(qr) {
                   if (_.includes(quals.systemQualNames, qr.Name)) {
                     var ret = _.chain(qr)
                         .omit('Name')
                         .extend({QualificationTypeId: qualNamesToIds[qr.Name]})
                         .value()
                     return Promise.resolve(ret)
                   } else {
                     return mtc.listQualificationTypes({
                       MustBeRequestable: false,
                       MustBeOwnedByCaller: true
                     }).promise().then(function(data) {
                       var serverQuals = data.QualificationTypes;
                       var matchingServerQual = _.find(serverQuals,
                                                       function(sq) {
                                                         return sq.Name == qr.Name
                                                       })
                       if (matchingServerQual) {
                         return _.chain(qr)
                           .omit('Name')
                           .extend({QualificationTypeId: matchingServerQual.QualificationTypeId})
                           .value()
                       } else {
                         var foundServerNames = _.map(serverQuals, 'Name')
                         console.error(`Error: No custom qualification with name ${qr.Name} found on ${endpoint}`)
                         console.error(`(Names found on server: ${foundServerNames.join(', ')})`)
                         process.exit()
                       }
                     })
                   }
                 }).then(
                   function(quals) {
                     turkParams.QualificationRequirements = quals;

                     if (allParams.Batch) {
                       uploadBatch(turkParams, endpoint)
                     } else {
                       uploadSingle(turkParams, endpoint)
                     }
                   }
                 )






}

function delay(t, v) {
  return new Promise(function(resolve) {
    setTimeout(resolve.bind(null, v), t)
  });
}

function uploadBatch(turkParams, endpoint) {
  var mtc = getClient({endpoint: endpoint})
  var metadata = {};

  var domain = endpoint == 'sandbox' ? 'workersandbox.mturk.com' : 'worker.mturk.com';

  mtc.createHITType(_.omit(turkParams, 'LifetimeInSeconds', 'Question', 'MaxAssignments')).promise()
    .then(function(data) {
      console.log(`Created HIT Type ${data.HITTypeId}`)

      var n = parseInt(turkParams.MaxAssignments),
          numBatches = Math.ceil(n / 9),
          batchSizes = _.map(_.range(numBatches),
                             function(i) {
                               return i < (numBatches - 1) ? 9 :
                                 (n % 9 == 0 ? 9 : n % 9)
                             })

      console.log('Uploaded HITs:');
      return SerialPromises(batchSizes, function(size) {
        return delay(500).then(
          function() {
            return mtc.createHITWithHITType({
              HITTypeId: data.HITTypeId,
              MaxAssignments: size,
              LifetimeInSeconds: turkParams.LifetimeInSeconds,
              Question: turkParams.Question
            }).promise().then(function(data) {
              console.log(data.HIT.HITId)
              console.log(`- Preview link: https://${domain}/mturk/preview?groupId=${data.HIT.HITGroupId}`)

              return data
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

function uploadSingle(turkParams, endpoint) {
  var mtc = getClient({endpoint: endpoint})

  mtc.createHIT(turkParams).promise()
    .then(function(data) {
      var hit = data.HIT
      var existingHitIds = fs.existsSync('hit-ids.json') ? JSON.parse(fs.readFileSync('hit-ids.json')) : {}

      fs.writeFileSync('hit-ids.json',
                       JSON.stringify(_.extend({},
                                               existingHitIds,
                                               _.fromPairs([[endpoint, hit]]))))

      var domain = endpoint == 'sandbox' ? 'workersandbox.mturk.com' : 'worker.mturk.com'
      console.log(`Uploaded. HIT ID is ${hit.HITId}`)
      console.log(`Preview link: https://${domain}/mturk/preview?groupId=${data.HIT.HITGroupId}`)
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

                 var answers = xmlConverted.QuestionFormAnswers.Answer;
                 if (!_.isArray(answers)) {
                   answers = [answers]
                 }

                 var pairs = answers.map(function(e) {
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
                 fs.writeFileSync(filename, JSON.stringify(data, null, 1))
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
      console.log(`New expiration is ${newDate.toString()}`)
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

function HITAddAssignments(HITId, numAssignments, mtc) {
  return mtc.createAdditionalAssignmentsForHIT({HITId: HITId,
                                                NumberOfAdditionalAssignments: numAssignments
                                               }).promise().then(function(data) {
                                                 console.log(`Added ${numAssignments} assignments to HIT ${HITId}`)
                                               })
}

// testing: rm hit-ids.json; node ../src/index.js create --assignments 30 --duration "2 days"; gsleep 2s; node ../src/index.js add 29 assignments
function addAssignments(creationData, numAssignments, endpoint) {
  var mtc = getClient({endpoint: endpoint});
  var isSingleMode = !_.isArray(creationData);
  if (isSingleMode) {
    return HITAddAssignments(creationData.HITId, numAssignments, mtc)
  } else {
    // first find the hit that has fewer than 9 assignments (if one exists)
    // and top it up to 9
    var hits = _.map(creationData, 'HIT');

    var topupHit = _.find(hits, function(h) { return h.MaxAssignments < 9 })
    var topUpAmount = 0;
    var promisors = [];

    if (topupHit) {
      // Math.min is needed because we might add fewer assignments than total
      topUpAmount = Math.min(numAssignments, 9 - topupHit.MaxAssignments);
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
    var n = numAssignments - topUpAmount,
        numBatches = Math.ceil(n / 9),
        batchSizes = _.map(_.range(numBatches),
                           function(i) {
                             return i < (numBatches - 1) ? 9 :
                               (n % 9 == 0 ? 9 : n % 9)
                           });

    var existingExpirations = _.map(hits, 'Expiration').map(function(exp) { return new Date(exp) })
    var maxExistingExpiration = _.max(existingExpirations)
    var secondsToMaxExistingExpiration = (maxExistingExpiration - Date.now()) / 1000
    var newLifetimeInSeconds = Math.max(secondsToMaxExistingExpiration, 345600)

    if (numBatches > 0) {
      promisors.push(function() {
        if (secondsToMaxExistingExpiration < 0) {
          console.log(`Creating new batches. Using a default expiration of 4 days`)
        } else {
          console.log(`Creating new batches. Setting expiration to current maximum ${maxExistingExpiration}`)
        }
        return Promise.resolve([])
      })

      promisors = promisors.concat(batchSizes.map(function(size, i) {
        return function() {
          return mtc.createHITWithHITType({
            HITTypeId: creationData[0].HIT.HITTypeId,
            MaxAssignments: size,
            LifetimeInSeconds: newLifetimeInSeconds,
            Question: creationData[0].HIT.Question
          }).promise().then(function(data) {
            console.log(`Created batch ${data.HIT.HITId}`)
            return data
          })
        }
      }))
    }

    return SerialPromises2(promisors).then(function(modifiedHits) {
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

function HITStatus(HITId, mtc) {
  return mtc
    .getHIT({HITId: HITId})
    .promise()
    .then(function(_h) {
      var h = _h.HIT;
      var created = new Date(h.CreationTime)
      var expires = new Date(h.Expiration)
      return {
        ID: h.HITId,
        Created: created.toLocaleDateString() + ' ' + created.toLocaleTimeString(),
        Expiration: expires.toLocaleDateString() + ' ' + expires.toLocaleTimeString(),
        Assignments: h.MaxAssignments,
        NumPending: h.NumberOfAssignmentsPending,
        NumAvailable: h.NumberOfAssignmentsAvailable,
        NumCompleted: h.NumberOfAssignmentsCompleted
      }
    })
}

function status(creationData, endpoint) {
  var mtc = getClient({endpoint: endpoint});

  var isSingleMode = !_.isArray(creationData);
  if (isSingleMode) {
    return HITStatus(creationData.HITId, mtc).then(function(metadata) {
      console.table([metadata])
    })
  } else {
    var HITIds = _.map(creationData, 'HIT.HITId')
    return SerialPromises(HITIds, function(HITId) { return HITStatus(HITId, mtc) })
      .then(function(metadata) {
        console.table(_.sortBy(metadata, 'Expiration'))
        var totalAvailable = _.chain(metadata).map('Assignments').sum().value()
        var totalCompleted = _.chain(metadata).map('NumCompleted').sum().value()

        console.log(`Total available: ${totalAvailable}`)
        console.log(`Total completed: ${totalCompleted}`)
      })
  }

}

function HITExpire(HITId, mtc) {
  return mtc.updateExpirationForHIT({HITId: HITId,
                                     ExpireAt: new Date
                                    }).promise()
}

function expire(creationData, endpoint) {
  var mtc = getClient({endpoint: endpoint});

  var isSingleMode = !_.isArray(creationData);
  if (isSingleMode) {
    return HITExpire(creationData.HITId, mtc).then(function(dat) {
      console.log('Expired HIT')
    })
  } else {
    var HITIds = _.map(creationData, 'HIT.HITId')
    return SerialPromises2(HITIds.map(function(HITId) { return function() { return HITExpire(HITId, mtc)} })).then(function(dat) {
      console.log('Expired HITs')
    })
  }

}


module.exports = {
  upload: upload,
  download: download,
  addTime: addTime,
  addAssignments: addAssignments,
  balance: balance,
  status: status,
  expire: expire,
  init: init
}
