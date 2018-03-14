var ask = require('./ask');
var readlineSync = require('readline-sync');

var quals = [];

var systemQualNames = ['Masters',
                       'Worker_NumberHITsApproved',
                       'Worker_Locale',
                       'Worker_Adult',
                       'Worker_PercentAssignmentsApproved']

function formulaHelp() {
  console.log('The syntax for a qualification is:')
  console.log('<NAME/ID> <COMPARATOR> <VALUE>')


  var namesList = systemQualNames.map(function(name) { return ' ' + name }).join('\n')
  console.log(`\nNames provided by MTurk are:\n${namesList}`)
  console.log(`You can also use the name or id of a custom qualification you have created`);

  var comparatorShorthands = ['=',
                              '!=',
                              '<',
                              '>',
                              '<=',
                              '>=',
                              'exists',
                              'doesntexist',
                              'in',
                              'notin'
                             ]
  var comparatorsList = comparatorShorthands.map(function(name) { return ' ' + name}).join('\n')
  console.log(`\nComparators are: \n${comparatorsList}`)
}

var askQual = function() {
  var qualNameOrId = readlineSync.question(`Enter qualification formula (type help for reminders on formula syntax)\n> `)
  // compute qual name
  console.log('Enter comparator and value\n> ')
}


//askQual()

formulaHelp()
