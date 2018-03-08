// these helper functions serially chain promises

// a promisor is a function that returns a promise
function SerialPromises2(promisors) {
  return promisors.reduce(
    function(acc, promisor) {
      return acc.then(function(result) {
        return promisor().then(Array.prototype.concat.bind(result))
      })
    },
    Promise.resolve([]))
}

// taskizer takes an item and returns a promisor
function SerialPromises(items, taskizer) {
  return items.reduce(
    function(acc, item) {
      return acc.then(function(result) {
        return taskizer(item).then(Array.prototype.concat.bind(result))
      })
    },
    Promise.resolve([]))
}

module.exports = {
  SerialPromises: SerialPromises,
  SerialPromises2: SerialPromises2
}
