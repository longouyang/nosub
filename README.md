# node-cosub

A command-line tool for managing external HITs on Amazon's Mechanical Turk.

## Philosophy

Many behavioral scientists use a Mechanical Turk workflow where they create a single External HIT with many assignments.
This corresponds to a single experiment with many participants.
The same HIT is often repurposed for multiple versions of the same experiment, so there's a need for a HIT management tool that facilitates multiple rounds of data collection and updating.

## Requirements

Node version 4 or higher.

## Installation

You can install node-cosub either globally (across your entire system) or locally (on a per project basis).
The global install is a little more convenient, although the local install facilitates greater reproducibility.

## Global installation

```
sudo npm install -g longouyang/node-cosub
```

## Local installation

```
npm install --save longouyang/node-cosub@<VERSION>
```

For reproducibility, replace `<VERSION>` with a version number or a git commit hash.

Local install: running binary works a little differently?


# Usage

First, place your AWS authentication credentials in `~/.aws/credentials` in this format:

```
[default]
aws_access_key_id = <ACCESS KEY ID>
aws_secret_access_key = <SECRET ACCESS KEY>
```

Next, go to a folder where you want to store your settings and results for a single HIT.

Now, run `cosub init`.
This will step you through creating your HIT.
After init, you can perform these actions:

```
cosub create   # create hit based on settings in settings.json
cosub update   # update hit based on settings in settings.json
cosub add <N> assignments
cosub add <N> {days/hours/minutes}
cosub expire   # expire hit
cosub download # download results to sandbox-results/ or production-results/
cosub status   # summarize HIT (settings, time left, # assignments, ...)
cosub history  # show history of cosub actions
cosub balance  # get mturk balance
```

By default, actions take place on the sandbox. You can run actions in production mode by adding '-p' after cosub, e.g., cosub -p create creates the HIT on the production site rather than the sandbox.

DISCUSS BATCH MODE

#### `create`

#### `update`

Is this a thing?

#### `add`

You can also combine adding assignments and time:

```
cosub add 40 assignments and 3 hours
```

In batch mode, 

#### `download`

#### `status`

#### `balance`

#### `history`