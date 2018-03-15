// (local-set-key (kbd "s-r") (lambda () (interactive) (save-buffer) (process-send-string "*shell nosub*" "echo '\n'; node ../src/enter-quals.js\n")))

var ask = require('./ask');
var readlineSync = require('readline-sync');
var _ = require('lodash');

var quals = [];
var responses = [];

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

var isoCountries = require('./iso/countries');
var isoSubdivisions = require('./iso/subdivisions');

function validateAndTransformLocale(str) {
  var strsplit = str.split(':')
  var country = strsplit[0],
      subdivision = strsplit[1],
      hasSubdivision = !_.isUndefined(subdivision)

  var countryData = _.find(isoCountries,
                           function(x) { return x.c2 == country || x.c3 == country })
  if (!countryData) {
    throw new Error('Unknown country ' + country)
  }

  var subdivisionData;
  if (hasSubdivision) {
    subdivisionData = _.find(isoSubdivisions,
                             function(x) { return x.sub == countryData.c2 + '-' + subdivision })

    if (!subdivisionData) {
      throw new Error(`Unknown subdivision ${subdivision} for country ${country}`)
    }
  }

  return {
    Country: country,
    Subdivision: subdivision
  }

}

// validates as we go
function validateAndTransformFormula(str) {
  // standardize whitespace delimiters to to single space
  var strsplit = str.split(/ +/g);
  if (strsplit.length > 3) {
    strsplit = [strsplit[0],
                strsplit[1],
                strsplit.slice(2).join(' ')]
  }

  var name = strsplit[0];

  if (strsplit.length < 2) {
    throw new Error('invalid formula')
  }

  var _comp = strsplit[1],
      comp = _comp.toLowerCase(), // case insensitive comparators
      _value = strsplit[2]

  if (!_.includes(comparators, comp)) {
    throw new Error('unknown comparator ' + _comp)
  }
  // can't do >, <, =, != on lists
  // masters exists or doesn't exist (no value)
  var value;
  if (!_.isUndefined(_value)) {
    value = _value.split(/, */g)
  }

  if (value && comp == 'exists') {
    console.log(`Warning: "exists" comparator will ignore value ${value}`)
  }

  // only two formulae for Worker_Adult:
  // Worker_Adult = 0
  // Worker_Adult = 1
  if (name == 'Worker_Adult' && (comp != '=' || !_.includes(['0','1'],_value)  )) {
    throw new Error('For Worker_Adult qualification, specify either:\nWorker_Adult = 1 (for adults)\nWorker_Adult = 0 (for children)')
  }

  var ret = {QualificationName: name,
             Comparator: comparatorTransforms[comp]}
  if (!_.isUndefined(value)) {

    if (name == 'Worker_Locale') {
      value = value.map(validateAndTransformLocale)
    } else {
      value = value.map(function(x) { return parseInt(x) })
    }

    _.extend(ret,
             _.fromPairs([[name == 'Worker_Locale' ? 'LocaleValues' : 'IntegerValues', value]]))
  }
  return ret
}


function formulaHelp() {
  console.log('The syntax for a qualification formula is:')
  console.log('<NAME> <COMPARATOR> <VALUE>')


  var namesList = systemQualNames.map(function(name) { return ' ' + name }).join('\n')
  console.log(`\nNames provided by MTurk are:\n${namesList}`)
  console.log(`You can also use the name of a custom qualification you have created`);


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
    if (quals.length == 0) {
      message = `Enter qualification formula\n(type 'help' for reminders on syntax, 'list' to see current formulae, and 'done' to finish qualifications)`
    } else {
      message = `Enter next formula (or 'help', 'list', or 'done')`
    }

  }
  var response = readlineSync.question(message + '\n> ')
  // compute qual name
  if (response == 'help') {
    formulaHelp()
    return askQual()
  } else if (response == 'list') {
    responses.forEach(function(resp,i) {
      console.log(`${i+1}. ${resp}`)
    } )
    return askQual()
  } else if (response == 'done') {
    return quals
  } else {
    var qual;
    try {
      qual = validateAndTransformFormula(response)
      responses.push(response)
      quals.push(qual)
      return askQual()
    } catch (e) {
      console.log('Error: ' + e.message)
      return askQual('')
    }

  }
}


console.log(JSON.stringify(askQual()))

//formulaHelp()

// Worker_Locale = MX
// Worker_Locale = MEX
// Worker_Locale notin USA:PA, USA:NY, USA:FL
