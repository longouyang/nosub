# nosub

A command-line tool for creating and managing external HITs on Amazon's Mechanical Turk.

## Installation

nosub requires [Node.js](https://nodejs.org) version 4 or higher.

From the command line and any folder, run:

```
sudo npm install -g longouyang/nosub
```

(todo: windows)

Next, make a subdirectory called `.aws` in your home directory (`~`) and in it place your AWS authentication credentials in a file called `credentials` (not `credentials.txt` or anything like that, just `credentials`). Use *exactly* this format:

```
[default]
aws_access_key_id = <ACCESS KEY ID>
aws_secret_access_key = <SECRET ACCESS KEY>
```

(the `[default]` line is required)

(todo: mention env variables, maybe read auth from disk?)

# Usage

## Initializing a HIT

Next, go to a folder where you want to store your settings and results for a single HIT.
Now, initialize by running `nosub init`.
This will walk you through creating your HIT and store your settings in the file `settings.json`.
You only need to initialize the HIT once -- after that, you can do any the management actions.

Initializing can be done in batch or single mode.
In batch mode, your task is spread across multiple HITs of 9 or fewer assignments (this avoids the extra 20% fee charged by Amazon).
Note that if you choose to use batch mode, you may want to implement some way of preventing the same worker from completing assignments in multiple batches (e.g., [uniqueturker.com](https://uniqueturker.myleott.com)

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

In batch mode, all batch HITs are started at the same time.

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
