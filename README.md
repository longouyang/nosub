# nosub

A command-line tool for creating and managing external HITs on Amazon's Mechanical Turk.

## Installation

Requires [Node.js](https://nodejs.org) version 4 or higher.
To install nosub, run this on the command line (you can be in any folder):

```
sudo npm install -g longouyang/nosub
```

(On windows, you don't need the `sudo` part.)

Next, make a subdirectory called `.aws` in your home directory.
Inside that subdirectory, create a file called `credentials` (not `credentials.txt` or anything like that, just `credentials`) and paste in your AWS credentials in this format:

```
[default]
aws_access_key_id = <ACCESS KEY ID>
aws_secret_access_key = <SECRET ACCESS KEY>
```

(You must use this exact format; the `[default]` line is required)

# Usage

## Initializing a HIT

Next, go to a folder where you want to store your settings and results for a single HIT.
Now, initialize by running `nosub init`.
This will walk you through creating your HIT and store your settings in the file `settings.json`.
You only need to initialize the HIT once -- after that, you can do any the management actions listed in the next action.

The walkthrough will ask you whether you want to use batch or single mode.
In single mode, your task is just a single HIT.
In batch mode, your task is spread across multiple HITs of 9 or fewer assignments (this avoids the extra 20% fee charged by Amazon).
Note that if you choose to use batch mode, you may want to implement some way of preventing the same worker from completing assignments in multiple batches (e.g., [Unique Turker](https://uniqueturker.myleott.com))

## Managing a HIT

After initializing, you can do these management actions.

```sh
nosub upload   # send HIT settings to mturk
nosub add <N> assignments
nosub add <N> {days/hours/minutes}
nosub expire   # expire hit
nosub download # download results
nosub status   # show HIT completion status (time and assignments remaining)
nosub balance  # get mturk balance
```

By default, actions take place on the sandbox. You can run actions in production mode by adding `-p` after nosub, e.g., `nosub -p upload` uploads the HIT to the production site rather than the sandbox.

### `upload`

In batch mode, all batch HITs are started at the same time.

### `add`

You can also combine adding assignments and time:

```
nosub add 40 assignments and 3 hours
```

In batch mode, assignments are added by topping up any batches with fewer than 9 assignments allocated and then creating new batches. Adding time is added only to unfinished batches.

### `download`

Worker IDs are anonymized by default, though the anonymization is deterministic, which allows you to detect repeat workers or check if workers did previous studies. (The anonymized worker ID is the MD5 hash of your Requester ID concatenated with the Worker ID).
To deanonymize workers, pass the `--deanonymize` flag.

### `status`

Shows how many workers have completed your HITs and how much time is remaining.

### `balance`

Shows your account balance.

# Advanced usage

## Custom qualifications

You can use custom qualifications to target or exclude workers based on various criteria.
As a basic example, suppose we are creating a HIT (call it HIT B) that should only be open to workers who have already completed some previous HIT (HIT A).
The idea here is to create a Qualification, grant it to every worker that completed HIT A, and require that this Qualification exists for HIT B.

First install the [`aws-shell` command line utility](https://github.com/awslabs/aws-shell).
Then, start the utility on the command line using the command `aws-shell`.
Inside the utility, create a qualification using `create-qualification-type`, e.g.,

```
aws> mturk create-qualification-type \
       --name CompletedPretraining
       --description 'Testing qualification' \
       --qualification-type-status Active
```

(Here, we've created a Qualification on production;
To create this same qualification on the sandbox, add the line `--endpoint-url https://mturk-requester-sandbox.us-east-1.amazonaws.com`.
It's useful to create the qualification on both sandbox and production *using the same name* to facilitate testing.)
The result of our command is:


```
{
    "QualificationType": {
        "AutoGranted": false,
        "Description": "Testing qualification",
        "QualificationTypeId": "32R8QD8BQ9UMMSZK1CNALDNHI99CD6",
        "CreationTime": 1521756718.0,
        "IsRequestable": true,
        "QualificationTypeStatus": "Active",
        "Name": "CompletedPretraining"
    }
}
```

Now, we need to get a list of all worker ids that completed HIT A.
After that, grant the qualification to those worker ids using the `associate-qualification-with-worker` command using the qualification type id from the response above:

```
aws> mturk associate-qualification-with-worker \
       --qualification-type-id 32R8QD8BQ9UMMSZK1CNALDNHI99CD6 \
       --worker-id <WORKER-ID-1>

aws> mturk associate-qualification-with-worker \
       --qualification-type-id 32R8QD8BQ9UMMSZK1CNALDNHI99CD6 \
       --worker-id <WORKER-ID-2>

...
```

Now, when you initialize HIT B, you can use the qualification name in nosub qualification formulae:

```
> nosub init

What is your task URL?
> example.com
...
Enter qualification formula
(type 'help' for reminders on syntax, 'list' to see current formulae, and 'done' to finish qualifications)
> CompletedPretraining exists
```

Custom qualifications can be quite powerful.
However, because there are so many different ways you can use them, nosub currently does not automate much of the process -- you'll need to do a fair amount of manual work using the `aws-shell` utility.
For more, see the [Amazon documentation](https://docs.aws.amazon.com/AWSMechTurk/latest/AWSMechanicalTurkRequester/Concepts_QualificationsArticle.html).
