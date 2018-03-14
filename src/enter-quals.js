var ask = require('./ask');
var readlineSync = require('readline-sync');
var _ = require('lodash');

var quals = [];

var systemQualNames = ['Masters',
                       'Worker_NumberHITsApproved',
                       'Worker_Locale',
                       'Worker_Adult',
                       'Worker_PercentAssignmentsApproved']

var comparators = ['=',
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

var comparatorTransforms = {
  '<': 'LessThan',
  '<=': 'LessThanOrEqualTo',
  '>': 'GreaterThan',
  '>=': 'GreaterThanOrEqualTo',
  '=':'EqualTo',
  '!=':'NotEqualTo',
  'exists': 'Exists',
  'doesntexist': 'DoesNotExist',
  'in': 'In',
  'notin': 'NotIn'
}
// validates as we go
function validateAndTransformFormula(str) {
  var strsplit = str.split(/ +/);
  var nameOrId = strsplit[0],
      _comp = strsplit[1],
      comp = _comp.toLowerCase(), // case insensitive comparators
      value = strsplit[2];

  if (!_.includes(comparators, comp)) {
    throw new Error('unknown comparator ' + _comp)
  }
  // can't do >, <, =, != on lists
  // masters exists or doesn't exist (no value)

  var typeId;
  var ret = {QualificationTypeId: 'todo',
             Comparator: comparatorTransforms[comp]}
  _.extend(ret,_.fromPairs([[typeId == 'Worker_Locale' ? 'LocaleValues' : 'IntegerValues', value]]))
  return ret
}


function formulaHelp() {
  console.log('The syntax for a qualification formula is:')
  console.log('<NAME/ID> <COMPARATOR> <VALUE>')


  var namesList = systemQualNames.map(function(name) { return ' ' + name }).join('\n')
  console.log(`\nNames provided by MTurk are:\n${namesList}`)
  console.log(`You can also use the name or ID of a custom qualification you have created`);


  var comparatorsList = comparators.map(function(name) { return ' ' + name}).join('\n')
  console.log(`\nComparators are: \n${comparatorsList}\n`)

  console.log('Value can be:')
  console.log(' a single integer: 5')
  console.log(' a list of integers: 5, 7, 23, 8')
  console.log(' a single location (ISO-3066 country code with optional ISO 3166-2 subdivision): USA:NY')
  console.log(' a list of locations: USA:NY, MEX, CAN')
  console.log('')
}

var askQual = function(message) {
  if (typeof message == 'undefined') {
    message = `Enter ${quals.length ? 'next ' : ''}qualification formula\n(type 'help' for reminders on syntax, 'list' to see current formulae, and 'done' to finish qualifications)`
  }
  var response = readlineSync.question(message + '\n> ')
  // compute qual name
  if (response == 'help') {
    formulaHelp()
    return askQual()
  } else if (response == 'list') {
    // todo
  } else if (response == 'done') {
    return quals
  } else {
    var qual;
    try {
      qual = validateAndTransformFormula(response)
      quals.push(qual)
      return askQual()
    } catch (e) {
      console.log('Error: ' + e.message)
      return askQual('')
    }

  }
}


console.log(askQual())

//formulaHelp()
