var AWS = require('aws-sdk'),
    _ = require('lodash'),
    minimist = require('minimist'),
    ask = require('./ask'),
    fs = require('fs'),
    convert = require('xml-js'),
    methods = require('./methods');

AWS.config.update({region:'us-east-1'});

var args = process.argv.slice(2);
var argv = require('minimist')(process.argv.slice(2));
var action  = _.isArray(argv['_']) ? argv['_'][0] : argv['_'];

var endpoint = _.has(argv, 'p') || _.has(argv, 'production') ? 'production' : 'sandbox';
console.log('Running on ' + endpoint);

// TODO: read settings here, then rewrite methods to take HITId as an argument

// TODO: move this logic inside the method
if (action == 'create') {
  var settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
  // TODO: if no settings file, run init

  if (!_.has(settings, "_cosubSpecVersion") || settings._cosubSpecVersion != 2) {
    console.error("Error reading settings file -- you may be reusing a settings file from a previous version of cosub")
    process.exit()
  }

  methods.create(_.extend({endpoint: endpoint}, settings, argv))
}

if (action == 'balance') {
  methods.balance(endpoint)
}

// if (action == 'init') {
//   init()
// }

if (action == 'status') {
  methods.status(endpoint)
}

if (action == 'download') {
  methods.download(endpoint)
}

if (action == 'add') {
  var argument = argv['_'].slice(1).join(' ')
  var timeMatch = argument.match(/(\d+) (second|minute|day|hour|week|month)/g)
  var assignmentsMatch = argument.match(/(\d+) (assignment)s?/)

  // handles mixing multiple units (e.g., 1 hour and 30 minutes)
  if (timeMatch) {
    var components = timeMatch.map(function(tm) { return tm.split(' ') })
    var componentSeconds = components.map(function(pair) {
      return parseInt(pair[0]) * {second: 1, minute: 60, hour: 3600, day: 86400, week: 604800}[pair[1]];
    })
    var totalTime = _.sum(componentSeconds)
    //var seconds = timeMatch[2]
    methods.addTime(totalTime, endpoint)
  }
  //methods.addTime(endpoint)
}
