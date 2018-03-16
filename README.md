# nosub

A command-line tool for creating and managing external HITs on Amazon's Mechanical Turk.

## Installation

nosub requires [Node.js](https://nodejs.org) version 4 or higher.

```
sudo npm install -g longouyang/nosub
```

(todo: windows)

Next, make a subdirectory called `aws` in your home directory (`~`) and in it place your AWS authentication credentials in a file called `credentials`. Use this format:

```
[default]
aws_access_key_id = <ACCESS KEY ID>
aws_secret_access_key = <SECRET ACCESS KEY>
```

(todo: mention env variables, maybe read auth from disk?)

# Usage

## Initializing a HIT

Next, go to a folder where you want to store your settings and results for a single HIT.
Now, initialize by running `nosub init`.
This will walk you through creating your HIT and store your settings in the file `settings.json`:

```
What is your task URL?
> https://foo.com
What is the title of your HIT?
> Bar
What is the description of your HIT?
> Baz
Provide some keywords for the HIT:
> qux
Do you want to run in (b)atch or (s)ingle mode?
> b
What frame height do you want?
> 450
How long will a worker have to complete your HIT?
You can answer in seconds, minutes, hours, days, or weeks.
> 30 minutes
After how long should unreviewed assignments be automatically approved?
You can answer in seconds, minutes, hours, days, or weeks.
> 5 minutes
How much you will pay each worker (in dollars)?
> $1
Enter qualification formula
(type 'help' for reminders on syntax, 'list' to see current formulae, and 'done' to finish qualifications)
> help
The syntax for a qualification formula is:
<NAME> <COMPARATOR> <VALUE>

Names provided by MTurk are:
 Masters
 Worker_NumberHITsApproved
 Worker_Locale
 Worker_Adult
 Worker_PercentAssignmentsApproved
You can also use the name of a custom qualification you have created

Comparators are:
 =
 !=
 <
 >
 <=
 >=
 exists
 doesntexist
 in
 notin

Value can be:
 a single integer: 5
 a list of integers: 5, 7, 23, 8
 a single location (ISO-3066 country code with optional ISO 3166-2 subdivision): US:NY
 a list of locations: US:NY, MEX, CAN

Enter next formula (or 'help', 'list', or 'done')
> Worker_Locale in US
Enter next formula (or 'help', 'list', or 'done')
> Worker_Locale notin US:NY, US:MA
Enter next formula (or 'help', 'list', or 'done')
> Worker_PercentAssignmentsApproved >= 85
Enter next formula (or 'help', 'list', or 'done')
> done
Wrote to settings.json
```

In batch mode, your task is spread across multiple HITs of 9 or fewer assignments (this avoids the extra 20% fee charged by Amazon).
Note that if you choose to use batch mode, you may want to implement some way of preventing the same worker from completing assignments in multiple batches (e.g., [uniqueturker.com](http://uniqueturker.com))

## Managing a HIT

After initializing, you can do these management actions.

```
nosub upload   # send HIT settings to mturk
nosub add <N> assignments
nosub add <N> {days/hours/minutes}
nosub expire   # expire hit
nosub download # download results to sandbox-results/ or production-results/
nosub status   # summarize HIT (settings, time left, # assignments, ...)
nosub history  # show history of nosub actions
nosub balance  # get mturk balance
```

By default, actions take place on the sandbox. You can run actions in production mode by adding '-p' after nosub, e.g., `nosub -p upload` uploads the HIT to the production site rather than the sandbox.

(todo: not yet implemented: `history`)

### `upload`

### `add`

You can also combine adding assignments and time:

```
nosub add 40 assignments and 3 hours
```

todo: in batch mode, assignments are added by creating new batches. time is added only to unfinished batches.

### `download`

note: worker ids are anonymized by default.
the anonymization is deterministic (md5 hash of your requester id concatenated with the worker's id), which allows you to check whether a worker performed this HIT multiple times or also performed a different HIT of yours in the past.

### `status`

### `balance`

### `history`
