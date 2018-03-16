#!/usr/bin/env node
var AWS = require('aws-sdk'),
    _ = require('lodash'),
    minimist = require('minimist'),
    ask = require('./ask'),
    fs = require('fs'),
    convert = require('xml-js'),
    methods = require('./methods'),
    promiseUtils = require('./promise-utils');

var SerialPromises = promiseUtils.SerialPromises,
    SerialPromises2 = promiseUtils.SerialPromises2;


AWS.config.update({region:'us-east-1'});

var args = process.argv.slice(2);
var argv = require('minimist')(process.argv.slice(2));
var action  = _.isArray(argv['_']) ? argv['_'][0] : argv['_'];

var endpoint = _.has(argv, 'p') || _.has(argv, 'production') ? 'production' : 'sandbox';

// TODO: read settings here, then rewrite methods to take HITId as an argument
var settings = {}

try {
  settings = JSON.parse(fs.readFileSync('settings.json'))
} catch(err) {
  //console.log('no settings file found')
  //process.exit()
}


var creationData;
try {
  creationData = JSON.parse(fs.readFileSync('hit-ids.json'))[endpoint]
} catch(err) {
  //console.log(err)
}


// TODO: move this logic inside the method
if (action == 'upload') {
  // TODO: if no settings file, run init

  if (!_.has(settings, "_cosubSpecVersion") || settings._cosubSpecVersion != 2) {
    console.error("Error reading settings file -- you may be reusing a settings file from a previous version of cosub")
    process.exit()
  }

  methods.upload(_.extend({endpoint: endpoint},settings, argv))
}

if (action == 'balance') {
  methods.balance(endpoint)
}

if (action == 'status') {
  methods.status(creationData, endpoint)
}

if (action == 'download') {
  if(!creationData) {
    console.error('Error: HIT settings have not been uploaded yet.')
    process.exit()
  }

  methods.download(creationData, !!argv.deanonymize, endpoint)
}

if (action == 'add') {
  var argument = argv['_'].slice(1).join(' ')
  var assignmentsMatch = argument.match(/(\d+) +(assignment)s?/)

  var promisors = [];

  // add assignments first so that if we're in batch mode and we add both assignments and time
  // that new batches receive the time extension
  if (assignmentsMatch) {
    promisors.push(function() {
      var numAssignments = parseInt(assignmentsMatch[1]);
      return methods.addAssignments(creationData, numAssignments, endpoint)
    })
  }

  var timeMatch = argument.match(/(\d+) (second|minute|day|hour|week|month)/g)
  // handles mixing multiple units (e.g., 1 hour and 30 minutes)
  if (timeMatch) {
    promisors.push(function() {
      var components = timeMatch.map(function(tm) { return tm.split(' ') })
      var componentSeconds = components.map(function(pair) {
        return parseInt(pair[0]) * {second: 1, minute: 60, hour: 3600, day: 86400, week: 604800}[pair[1]];
      })
      var seconds = _.sum(componentSeconds)
      return methods.addTime(creationData, seconds, endpoint)
    })
  }

  SerialPromises2(promisors)
}

if (action == 'expire') {
  methods.expire(creationData, endpoint)
}

if (action == 'init') {
  methods.init(argv, endpoint)
}
