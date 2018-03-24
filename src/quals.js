// (local-set-key (kbd "s-r") (lambda () (interactive) (save-buffer) (process-send-string "*shell nosub*" "echo '\n'; node ../src/enter-quals.js\n")))

var ask = require('./ask');
var readlineSync = require('readline-sync');
var _ = require('lodash');
var fs = require('fs')

var quals = [];
var responses = [];

var systemQualNames = ['Masters',
                       'Worker_NumberHITsApproved',
                       'Worker_Locale',
                       'Worker_Adult',
                       'Worker_PercentAssignmentsApproved']

var qualNamesToIds = {
  production: {
    Masters: '2F1QJWKUDD8XADTFD2Q0G6UTO95ALH',
    Worker_NumberHITsApproved: '00000000000000000040',
    Worker_Locale: '00000000000000000071',
    Worker_Adult: '00000000000000000060',
    Worker_PercentAssignmentsApproved: '000000000000000000L0'
  },
  sandbox: {
    Masters: '2ARFPLSP75KLA8M8DH1HTEQVJT3SY6',
    Worker_NumberHITsApproved: '00000000000000000040',
    Worker_Locale: '00000000000000000071',
    Worker_Adult: '00000000000000000060',
    Worker_PercentAssignmentsApproved: '000000000000000000L0'
  }
}

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
    Country: countryData.c2,
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

  // check if the user made a typo entering a system name
  if (!_.includes(systemQualNames, name)) {
    var nearbyName = _.find(systemQualNames, function(sn) { return editDistance(sn, name) < 3})
    if (nearbyName) {
        throw new Error(`Invalid qualification ${name}. Did you mean ${nearbyName}?`)
    }
  }

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

  var ret = {Name: name,
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

// HT https://gist.github.com/andrei-m/982927
function editDistance(a, b){
  if(a.length == 0) return b.length;
  if(b.length == 0) return a.length;

  var matrix = [];

  // increment along the first column of each row
  var i;
  for(i = 0; i <= b.length; i++){
    matrix[i] = [i];
  }

  // increment each column in the first row
  var j;
  for(j = 0; j <= a.length; j++){
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for(i = 1; i <= b.length; i++){
    for(j = 1; j <= a.length; j++){
      if(b.charAt(i-1) == a.charAt(j-1)){
        matrix[i][j] = matrix[i-1][j-1];
      } else {
        matrix[i][j] = Math.min(matrix[i-1][j-1] + 1, // substitution
                                Math.min(matrix[i][j-1] + 1, // insertion
                                         matrix[i-1][j] + 1)); // deletion
      }
    }
  }

  return matrix[b.length][a.length];
};


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
  console.log(' a single location (ISO-3066 country code with optional ISO 3166-2 subdivision): US:NY')
  console.log(' a list of locations: US:NY, MEX, CAN')
  console.log('')
}

function readLines(filename) {
  var contents;
  try {
    contents = fs.readFileSync(filename, 'UTF8')
  } catch(e) {
    console.error('Error reading file')
    console.error(e.message)
  }
  // ignore empty whitespace or lines starting with #
  var lines = _.reject(contents.split('\n'),
                       function(str) { return /^\s*$/.test(str) || /^#/.test(str) })
  return lines;
}

var askQual = function(message) {
  if (typeof message == 'undefined') {
    if (quals.length == 0) {
      message = `Enter qualification formula\n(type 'help' for reminders on syntax, 'list' to see current formulae, 'done' to finish qualifications, or 'load <filename>' to read qualifications from a file on disk.)`
    } else {
      message = `Enter next formula (or 'help', 'list', 'load <filename>', or 'done')`
    }

  }
  var response = readlineSync.question(message + '\n> ')
  // compute qual name
  if (response == 'help') {
    formulaHelp()
    return askQual()
  } else if (/^load/.test(response)) {
    var filename = response.replace(/^load\s+/, "")
    var lines = readLines(filename);

    try {
      quals = quals.concat(lines.map(validateAndTransformFormula))
      responses = responses.concat(lines)

      console.log(`Added qualifications from ${filename}:\n${responses.join('\n')}`)

    } catch(e) {
      console.error('Error loading from file:')
      console.error(e.message)
    } finally {
      return askQual('')
    }
  } else if (response == 'list') {
    if (responses.length == 0) {
      console.log('No qualifications entered\n')
    } else {
      console.log('Qualifications entered so far:')
      responses.forEach(function(resp,i) {
        console.log(`${i+1}. ${resp}`)
      } )
      console.log('')
    }

    return askQual()
  } else if (response == 'done') {
    return quals
  } else {
    var qual;
    try {
      qual = validateAndTransformFormula(response)
      responses.push(response)
      console.log(`Added ${qual.Name} qualifications\n`)
      quals.push(qual)
      return askQual()
    } catch (e) {
      console.log('Error: ' + e.message)
      return askQual('')
    }

  }
}

module.exports = {
  ask: askQual,
  systemQualNames: systemQualNames,
  namesToIds: qualNamesToIds
}

//formulaHelp()

//console.log(JSON.stringify(loadFromFile('quals.txt'), null, 1))
//console.log(askQual())
// Worker_Locale = MX
// Worker_Locale = MEX
// Worker_Locale notin USA:PA, USA:NY, USA:FL
