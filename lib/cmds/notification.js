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
    hooks = require('../hooks'),
    logger = require('../logger'),
    watched = null,
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
        var config = base.getConfig();

        watched = (config && config.hooks && config.hooks.notification && config.hooks.notification.users
                    && config.hooks.notification.users[options.user] && config.hooks.notification.users[options.user].repos
                    && config.hooks.notification.users[options.user].repos[options.repo]
                    && config.hooks.notification.users[options.user].repos[options.repo].watched) || '2008-04-01T00:00:00Z';

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
            var last_create = watched;

            listEvents.forEach(function(event) {
                event.txt = instance.getMessage_(event);
                if (!event.txt) return;

                if (options.watch) {
                    if ( (event.created_at > last_create) && (!printed[event.created_at])) {
                        last_create = event.created_at;
                        filteredListEvents.push(event);
                    }
                }
                else {
                    filteredListEvents.push(event);
                }

                printed[event.created_at] = true;
            });

            if (last_create > watched) {
              var config = base.getConfig();

              if (!config.hooks) config.hooks = {};
              if (!config.hooks.notification) config.hooks.notification = {};
              if (!config.hooks.notification.users) config.hooks.notification.users = {};
              if (!config.hooks.notification.users[options.user]) config.hooks.notification.users[options.user] = {};
              if (!config.hooks.notification.users[options.user].repos) config.hooks.notification.users[options.user].repos = {};
              if (!config.hooks.notification.users[options.user].repos[options.repo]) config.hooks.notification.users[options.user].repos[options.repo] = {};

              watched = last_create;
              config.hooks.notification.users[options.user].repos[options.repo].watched = watched;

              base.writeGlobalConfig('hooks', config.hooks);
            }
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

            var uri = function(url, suffix) {
              var prefix, server, x;

              if (url.indexOf('https://api.') !== 0) return;
              prefix = url.substring(12);

              x = prefix.indexOf('/');
              if (x < 1) return;
              server = prefix.substring(0, x);
              prefix = prefix.substring(x + 1);

              x = prefix.indexOf('/');
              if (x < 1) return;
              prefix = prefix.substring(x);

              return 'https://' + server + prefix + (suffix || '');
            }
            filteredListEvents.reverse().forEach(function(event) {
                var payload = event.payload;
                event.text = '@' + event.actor.login + ' ' + event.txt + ' ' + event.repo.name;
                event.open = { CreateEvent        : payload.ref          
                                                                         && event.repo
                                                                         && uri(event.repo.url,
                                                                                '/tree/' + payload.ref)
                             , CommitCommentEvent : payload.comment      && payload.comment.html_url
                             , DeleteEvent        : event.repo           && uri(event.repo.url)
                             , ForkEvent          : event.actor          && uri(event.actor.url)
                             , GollumEvent        : uri(event.repo.url, '/wiki')
                             , IssueCommentEvent  : payload.comment      && payload.comment.html_url
                             , IssuesEvent        : payload.action === 'opened'
                                                                         && payload.issue
                                                                         && payload.issue.html_url
                             , PullRequestEvent   : payload.pull_request && payload.pull_request.html_url
                             , PushEvent          : payload.commits      && payload.commits[0]
                                                                         && payload.commits[0].sha
                                                                         && event.repo
                                                                         && uri(event.repo.url, 
                                                                                '/commit/' + payload.commits[0].sha)
                             }[event.type] || 'https://github.com';

                hooks.invoke('notification.watch', { options: { event : event
                                                              , repo  : options.repo
                                                              , user  : options.user
                                                              } }, function(cb) { cb && cb(); });
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
            txt = 'created the ' + payload.ref + ' ' + payload.ref_type + ' at';
            break;
        case 'DeleteEvent':
            txt = 'removed the ' + payload.ref + ' ' + payload.ref_type + ' at';
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
