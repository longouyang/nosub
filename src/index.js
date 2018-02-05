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
var action  = argv['_'];

var endpoint = _.has(argv, 'p') || _.has(argv, 'production') ? 'production' : 'sandbox';
console.log('Running on ' + endpoint);


// TODO: default to sandbox, specify production environment using -p or --production
if (action == 'create') {
  var settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
  // TODO: if no settings file, run init

  if (!_.has(settings, "_cosubSpecVersion") || settings._cosubSpecVersion != 2) {
    console.error("Error reading settings file -- you may be reusing a settings file from a previous version of cosub")
    process.exit()
  }

  // TODO: handle error
  methods.create(_.extend({endpoint: endpoint}, settings))
}

// if (action == 'balance') {
//   getBalance()
// }

// function init() {
// }

// if (action == 'init') {
//   init()
// }

if (action == 'download') {
  methods.download(endpoint)
}


if (action == 'add') {
  // TODO: detect if we're adding time, assignments, or both
  methods.addTime(endpoint)
}
