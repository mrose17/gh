/*
 * Copyright 2013, All Rights Reserved.
 *
 * Code licensed under the BSD License:
 * https://github.com/node-gh/gh/blob/master/LICENSE.md
 *
 * @author Zeno Rocha <zno.rocha@gmail.com>
 * @author Eduardo Lundgren <edu@rdo.io>
 */

'use strict';

// -- Requires -------------------------------------------------------------------------------------

var async = require('async'),
    base = require('../base'),
    clc = require('cli-color'),
    logger = require('../logger'),
    printed = {};

// -- Constructor ----------------------------------------------------------------------------------

function Notifications(options) {
    this.options = options;

    if (!options.repo) {
        logger.error('You must specify a Git repository to run this command');
    }
}

// -- Constants ------------------------------------------------------------------------------------

Notifications.DETAILS = {
    alias: 'nt',
    description: 'Provides a set of util commands to work with Notifications.',
    commands: [
        'latest',
        'watch'
    ],
    options: {
        'latest': Boolean,
        'remote': String,
        'repo': String,
        'user': String,
        'watch': Boolean
    },
    shorthands: {
        'l': ['--latest'],
        'r': ['--repo'],
        'u': ['--user'],
        'w': ['--watch']
    },
    payload: function(payload, options) {
        options.latest = true;
    }
};

// -- Commands -------------------------------------------------------------------------------------

Notifications.prototype.run = function() {
    var instance = this,
        options = instance.options;

    if (options.latest) {
        logger.logTemplate(
            '{{prefix}} [info] Listing activities on {{greenBright options.user "/" options.repo}}', {
                options: options
            });

        instance.latest();
    }

    if (options.watch) {
        logger.logTemplate(
            '{{prefix}} [info] Watching any activity on {{greenBright options.user "/" options.repo}}', {
                options: options
            });

        instance.watch();
    }
};

Notifications.prototype.latest = function(opt_watch) {
    var instance = this,
        options = instance.options,
        operations,
        payload,
        listEvents,
        filteredListEvents = [];

    operations = [

        function(callback) {
            payload = {
                user: options.user,
                repo: options.repo
            };

            base.github.events.getFromRepo(payload, function(err, data) {
                if (!err) {
                    listEvents = data;
                }
                callback(err);
            });
        },
        function(callback) {
            listEvents.forEach(function(event) {
                event.txt = instance.getMessage_(event);
                if (!event.txt) return;

                if (options.watch) {
                    if (!printed[event.created_at]) {
                        filteredListEvents.push(event);
                    }
                }
                else {
                    filteredListEvents.push(event);
                }

                printed[event.created_at] = true;
            });
            callback();
        }
    ];

    async.series(operations, function(err) {
        if (filteredListEvents.length) {
            logger.logTemplateFile('notification.handlebars', {
                events: filteredListEvents,
                latest: options.latest,
                repo: options.repo,
                user: options.user,
                watch: opt_watch
            });
        }

        logger.defaultCallback(err, null, false);
    });
};

Notifications.prototype.watch = function() {
    var instance = this,
        intervalTime = 3 * 60 * 1000;

    instance.latest();

    setInterval(function() {
        instance.latest(true);
    }, intervalTime);
};

Notifications.prototype.getMessage_ = function(event) {
    var txt = '',
        type = event.type,
        payload = event.payload;

    switch (type) {
        case 'CommitCommentEvent':
            txt = 'commented on a commit at';
            break;
        case 'CreateEvent':
            txt = 'created a ' + payload.ref_type + ' at';
            break;
        case 'DeleteEvent':
            txt = 'removed ' + payload.ref_type + ' at';
            break;
        case 'DeploymentEvent':
            txt = 'deployed ' + payload.name + ' at';
            break;
        case 'DeploymentStatusEvent':
            txt = payload.state + ' status for deployment at';
            break;
        case 'DownloadEvent':
            break;
        case 'FollowEvent':
            break;
        case 'ForkEvent':
            txt = 'forked';
            break;
        case 'ForkApplyEvent':
            break;
        case 'Gist Event':
            break;
        case 'GollumEvent':
            txt = 'updated the wiki for';
            break;
        case 'IssueCommentEvent':
            txt = 'commented on issue #' + payload.issue.number + ' at';
            break;
        case 'IssuesEvent':
            txt = payload.action + ' issue #' + payload.issue.number + ' at';
            break;
        case 'MemberEvent':
            txt = 'added ' + payload.member + ' as a collaborator to';
            break;
        case 'PublicEvent':
            txt = 'open sourced';
            break;
        case 'PullRequestEvent':
            txt = payload.action + ' pull request #' + payload.number + ' at';
            break;
        case 'PullRequestReviewCommentEvent':
            txt = 'commented on a pull request at';
            break;
        case 'PushEvent':
            txt = 'pushed ' + payload.commits.length + ' commit' + (payload.commits.length != 1 ? 's' : '') + ' to';
            break;
        case 'ReleaseEvent':
            txt = 'published release for';
            break;
        case 'StatusEvent':
            txt = payload.state + ' status of commit at';
            break;
        case 'TeamAddEvent':
            txt = 'adds team member ' + payload.user;
            break;
        case 'WatchEvent':
            txt = 'is now watching';
            break;
        default:
            logger.error('event type not found: ' + clc.red(type));
            break;
    }

    return txt;
};

exports.Impl = Notifications;
