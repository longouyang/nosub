# nosub

A command-line tool for creating and managing external HITs on Amazon's Mechanical Turk.

## Installation

Requires [Node.js](https://nodejs.org) version 4 or higher.
To install nosub, run this on the command line (you can be in any folder):

```
sudo npm install -g longouyang/nosub
```

(todo: windows)

Next, go to your home directory and make a subdirectory called `.aws`.
Create a file called `credentials` (not `credentials.txt` or anything like that, just `credentials`) and paste in your AWS credentials in this format:

```
[default]
aws_access_key_id = <ACCESS KEY ID>
aws_secret_access_key = <SECRET ACCESS KEY>
```

(You must use this exact format; the `[default]` line is required)

(todo: mention env variables, maybe read auth from disk?)

# Usage

## Initializing a HIT

Next, go to a folder where you want to store your settings and results for a single HIT.
Now, initialize by running `nosub init`.
This will walk you through creating your HIT and store your settings in the file `settings.json`.
You only need to initialize the HIT once -- after that, you can do any the management actions listed in the next action.

The walkthrough will ask you whether you want to use batch or single mode.
In single mode, your task is just a single HIT.
In batch mode, your task is spread across multiple HITs of 9 or fewer assignments (this avoids the extra 20% fee charged by Amazon).
Note that if you choose to use batch mode, you may want to implement some way of preventing the same worker from completing assignments in multiple batches (e.g., [Unique Turker](https://uniqueturker.myleott.com)

## Managing a HIT

After initializing, you can do these management actions.

```sh
nosub upload   # send HIT settings to mturk
nosub add <N> assignments
nosub add <N> {days/hours/minutes}
nosub expire   # expire hit
nosub download # download results
nosub status   # show HIT completion status (time and assignments remaining)
nosub log      # show history of nosub actions
nosub balance  # get mturk balance
```

By default, actions take place on the sandbox. You can run actions in production mode by adding `-p` after nosub, e.g., `nosub -p upload` uploads the HIT to the production site rather than the sandbox.

(todo: not yet implemented: `log`)

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

# Advanced usage

## Custom qualifications

To create a custom qualification, first install the `aws-shell` command line utility.
Then, start the utility:

```
aws-shell
```

Create a qualification using `create-qualification-type`. An example:

```
mturk create-qualification-type --name CompletedPretraining --description 'Testing qualification' --qualification-type-status Active --endpoint-url https://mturk-requester-sandbox.us-east-1.amazonaws.com
```

Now you can use the name that you  as in a qualification formula when you initialize your HIT:

```
CompletedPretraining exists
```

(todo: more detail)
