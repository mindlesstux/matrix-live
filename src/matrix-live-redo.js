/******************************************************************************
 *                                                                            *
 *  Matrix Live is a liveblogging utility built on top of Matrix.             *
 *                                                                            *
 ******************************************************************************/


// We find the matrix-live event after the page has completed loading.
$( document ).ready(function() {

    var origElement = $('matrix-live');
    
    // Room members hash
    var roomMembers = {};

    // Gather configuration from element attributes
    // Default configuration:
    var config = {};
    config.homeserver = origElement.attr('homeserver') || 'https://matrix.org';
    config.room = origElement.attr('room');
    config.show_footer = (origElement.attr('show-footer') !== 'false');
    config.show_topic = (origElement.attr('show-topic') !== 'false');
    config.show_roomname = (origElement.attr('show-roomname') !== 'false');
    config.div_roomname = origElement.attr('div-roomname') || 'matrix-live-roomname';
    config.initial_load = ($.isNumeric(origElement.attr('initial-load')) ? origElement.attr('initial-load') : 60);

    // Remove trailing slash from homeserver URL
    config.homeserver = config.homeserver.replace(/\/$/, '');

    var md = window.markdownit();

    // Replace element with Matrix Live HTML
    var mLive = $(
        '<div class="matrix-live-main">' +
        (config.show_roomname ? '<div class="matrix-live-roomname"></div>' : '' ) +
        (config.show_topic ? '<div class="matrix-live-topic"></div>' : '') +
        '<div class="matrix-live-loading">Loading...</div>' +
        '<div class="matrix-live-body"></div>' +
        (config.show_footer ? '<div class="matrix-live-footer"><a href="https://live.hello-matrix.net/" target="_blank">Powered by Matrix Live</a></div>' : '') +
        '</div>'
    );

    // Obtain authorization token for guest access
    var getAuthToken = function(config) {
        return $.Deferred(function( defer ) {
            // Do we already have an access token for this homeserver in local storage?
            // If yes return it!
            var existingToken = localStorage.getItem('access:' + config.homeserver);
            if(existingToken) {
                config.access_token = existingToken;
                defer.resolve(existingToken);
                return;
            }
    
            $.ajax({
                url: config.homeserver + '/_matrix/client/r0/register?kind=guest',
                type: 'POST',
                contentType: 'application/json',
                data: '{ "initial_device_display_name": "Matrix Live Reader" }',
                processData: false,
                dataType : 'json'
            }).then(
                function(res) {
                    if(!res.access_token) {
                        console.log('Received strange response from matrix: ');
                        console.log(res);
   
                        defer.reject();
                    } else {
                        // Store access token in local storage
                        localStorage.setItem('access:' + config.homeserver, res.access_token);
            
                        config.access_token = res.access_token;
                        defer.resolve(res.access_token);
                    }
                },
                defer.reject
          );
        }).promise();
    };
  

    // Format bytes depending on their magnitude
    var formatBytes = function(bytes) {
        if(bytes > 1000000000) {
            // More than 1 gigabyte => display as GB
            // (yes, we use the new 1000 here instead of 1024 as this seems to be the consensus by now)
            return (Math.round(bytes / 100000000)/10).toLocaleString() + ' GB';

        } else if(bytes > 1000000) {
            // More than 1 megabyte => display as MB
            return (Math.round(bytes / 100000)/10).toLocaleString() + ' MB';

        } else if(bytes > 1000) {
            // More than 1 kilobyte => display as KB
            return (Math.round(bytes / 100)/10).toLocaleString() + ' KB';

        } else {
            // Display as bytes
            return bytes.toLocaleString() + ' bytes';

        }
    };

    // Post update
    var processEvent = function(config, matrixEvent, mLiveBody, isUpdate, mLive) {
        console.log("------------------------------------------------");
        const options = { timeZoneName: 'short', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month:'2-digit',year: 'numeric' };
        if (matrixEvent.type === 'm.room.message') {
            if (matrixEvent.content.msgtype === 'm.text') {
                //messageHtml = matrixEvent.content.body;
                messageHtml = md.renderInline(matrixEvent.content.body);
                //messageHtml = marked(matrixEvent.content.body, { sanitize: true });

                newEntry = $(
                    '<div class="matrix-live-entry' + (isUpdate ? ' matrix-live-new' : '') + '" matrix-event-id="' + matrixEvent.event_id.replace(/[^a-zA-Z0-9:\-\._!$%+=]/g, '') + '">' +
                    '<div class="matrix-live-entry-body">' + messageHtml + '</div>' +
                    '<div class="matrix-live-entry-author"></div>' +
                    '<div class="matrix-live-entry-edited"></div>' +
                    '<div class="matrix-live-entry-time">' + (new Date(matrixEvent.origin_server_ts)).toLocaleTimeString([], options) + '</div>' +
                    '</div>'
                );

                // We set author using text method to avoid XSS
                newEntry.children('.matrix-live-entry-author').text(roomMembers[matrixEvent.sender] == undefined || roomMembers[matrixEvent.sender] == ''  ? matrixEvent.sender : roomMembers[matrixEvent.sender]);

                //console.log(Object.getOwnPropertyNames(matrixEvent.content));

                if ('m.relates_to' in  matrixEvent.content ) {
                    // We set author using text method to avoid XSS
                    newEntry.children('.matrix-live-entry-edited').text('Edited');

                    // Replacee this item for this edit
                    mLiveBody.find('.matrix-live-entry[matrix-event-id="' + matrixEvent.event_id.replace(/[^a-zA-Z0-9:\-\._!$%+=]/g, '') + '"]');
                } else {
                    // Ok, append entry.
                    mLiveBody.prepend(newEntry);
                }

            } else if (matrixEvent.content.msgtype === 'm.image') {
                // Is the image valid? Otherwise return.
                if(match = matrixEvent.content.url.match(/^mxc:\/\/([a-zA-Z0-9\.\-]+)\/([0-9a-zA-Z]+)$/i)) {
                    myServerName = match[1];
                    myMediaId = match[2];
                } else {
                    return;
                }

                // Do we need a link? Only if the width of the image is grater than 700px
                linkNeeded = (matrixEvent.content.info.w > 700);

                // Ok, display image thumbnail with link to full-size image in new window.
                newEntry = $(
                    '<div class="matrix-live-entry' + (isUpdate ? ' matrix-live-new' : '') + '" matrix-event-id="' + matrixEvent.event_id.replace(/[^a-zA-Z0-9:\-\._!$%+=]/g, '') + '">' +
                    '<div class="matrix-live-entry-image">' +
                    (linkNeeded ? '<a href="' + config.homeserver + '/_matrix/media/r0/download/' + myServerName + '/' + myMediaId +'" target="_blank">' : '') +
                    '<img src="' + config.homeserver + '/_matrix/media/r0/thumbnail/' + myServerName + '/' + myMediaId + '?width=700&height=700&method=scale">' +
                    (linkNeeded ? '</a>' : '') +
                    '</div>' +
                    '<div class="matrix-live-entry-author"></div>' +
                    '<div class="matrix-live-entry-edited"></div>' +
                    '<div class="matrix-live-entry-time">' + (new Date(matrixEvent.origin_server_ts)).toLocaleTimeString([], options) + '</div>' +
                    '</div>'
                );

                // We set author using text method to avoid XSS
                newEntry.children('.matrix-live-entry-author').text(roomMembers[matrixEvent.sender] == undefined || roomMembers[matrixEvent.sender] == '' ? matrixEvent.sender : roomMembers[matrixEvent.sender]);

                mLiveBody.prepend(newEntry);
            }

        } else if(matrixEvent.type === 'm.room.topic') {
            // TODO: Update the topic div
            if  (config.show_topic) {
                console.log("    TOPIC: " + matrixEvent.content.topic);
                console.log("           " + JSON.stringify(matrixEvent));
                //mLive.children('.matrix-live-topic').text(matrixEvent.content.body);
                $(".matrix-live-topic").html(matrixEvent.content.topic)
            }

        } else if(matrixEvent.type === 'm.room.member') {
            if (matrixEvent.membership === 'join' && matrixEvent.content.displayname !== undefined) {
                // Add new room member to room member list
                roomMembers[matrixEvent.user_id] = matrixEvent.content.displayname;
            }

        } else if(matrixEvent.type === 'm.room.redaction') {
            // Remove item for this redaction
            mLiveBody.find('.matrix-live-entry[matrix-event-id="' + matrixEvent.redacts.replace(/[^a-zA-Z0-9:\-\._!$%+=]/g, '') + '"]').remove();
        } else if(matrixEvent.type === 'm.reaction') {
            // Message reactions
        } else if(matrixEvent.type === 'org.matrix.msc3381.poll.start') {
            // Poll start
        } else if(matrixEvent.type === 'org.matrix.msc3381.poll.response') {
            // Poll response
        } else if(matrixEvent.type === 'm.room.canonical_alias') {
            // Room alias
        } else if(matrixEvent.type === 'm.room.power_levels') {
            // List of the permission level/power levels in the room
        } else if(matrixEvent.type === 'm.room.guest_access') {
            // ???
        } else if(matrixEvent.type === 'm.room.name') {
            // Room name, maybe use this as part of the page title?
            console.log("     NAME: " + matrixEvent.content.name);
            console.log("           " + JSON.stringify(matrixEvent));
            x = '<h3 class="entry-title">' + matrixEvent.content.name + '</h3>';
            console.log("           Attempting to update: " + config.div_roomname);
            $("." + config.div_roomname).html(x)
        } else if(matrixEvent.type === 'm.room.history_visibility') {
            // ???
        } else {
            console.log("Unknown Event Type");
            //console.lgo("    " + matrixEvent.type);
            console.log(JSON.stringify(matrixEvent));
        }
    };


    // Perform initial sync
    var getInitialSync = function(config, mLiveBody, secondTry, mLive) {
        return $.Deferred(function( defer ) {
            $.ajax({
                url: config.homeserver + '/_matrix/client/r0/rooms/' + encodeURIComponent(config.room) + '/initialSync?limit=' + config.initial_load + '&access_token=' + encodeURIComponent(config.access_token),
                type: 'GET',
                dataType : 'json'
            }).then(
                function(res) {
                    if(!res.messages || !res.messages.chunk || !Array.isArray(res.messages.chunk) || !res.state || !Array.isArray(res.state)) {
                        console.log('Received strange response from matrix: ');
                        console.log(res);
                        defer.reject();
                    } else {
                        // Process all members (to obtain display names)
                        res.state.forEach(function(state) {
                            if(state.type === 'm.room.member' && state.membership === 'join' && state.content && state.content.displayname !== undefined) {
                                roomMembers[state.user_id] = state.content.displayname;
                            }
                        });

                        // Process all events
                        res.messages.chunk.forEach(function(evt) { processEvent(config, evt, mLiveBody, false, mLive); });

                        defer.resolve(res.messages.end);
                    }
                },
                function(err) {
                    // If our access token is invalid, we will try a second time with a new access token.
                    // Otherwise, we will return the error.
                    if(err.status === 403 && err.responseJSON.errcode === 'M_UNKNOWN_TOKEN' && !secondTry) {
                        localStorage.removeItem('access:' + config.homeserver);

                        getAuthToken(config)
                            .then(function() {
                                return getInitialSync(config, mLiveBody, true);
                            })
                            .then(defer.resolve, defer.reject);

                    } else {
                        defer.reject();
                    }
                }
           );
        }).promise();
    };


    // Start event loop
    var startEventLoop = function(config, initialStart, mLiveBody, mLive) {
        var doLoop = function(defer, start) {
            $.ajax({
            url: config.homeserver + '/_matrix/client/r0/events?room_id=' + encodeURIComponent(config.room) + '&timeout=30000&from=' + encodeURIComponent(start) + '&access_token=' + encodeURIComponent(config.access_token),
            type: 'GET',
            dataType : 'json'
            }).then(
            function(res) {
                if(!res.chunk || !Array.isArray(res.chunk)) {
                console.log('Received strange response from matrix: ');
                console.log(res);
                defer.reject();
                } else {
                // Process all events
                res.chunk.forEach(function(evt) { processEvent(config, evt, mLiveBody, true, mLive); });

                // TODO: When members change their display name => update roomMembers!

                // Call myself again.
                doLoop(defer, res.end);
                }
            },
            defer.reject
            );
        };

        return $.Deferred( function( defer ) {
            doLoop(defer, initialStart);
        }).promise();
    };

    /*****************************************************************************/
    /* MAIN SETUP FOR MATRIX LIVE                                                */
    /*****************************************************************************/

    // Main function that performs all the magic
    var addMatrixLive = function(idx, ele) {
        var origElement = $(ele);

        origElement.replaceWith(mLive);

        var loadingIndicator = mLive.children('.matrix-live-loading');
        var mLiveBody = mLive.children('.matrix-live-body');


        // Obtain auth token as guest
        config.access_token = undefined;
        getAuthToken(config)
            .then(function() {
                // Obtain initial sync for room
                return getInitialSync(config, mLiveBody, mLive);
            })
            .then(function(start) {
                // Switch loading indicator to spinning wheel
                loadingIndicator.html('Streaming live... &nbsp;&nbsp;&nbsp; <img width="12" height="12" src="data:image/gif;base64,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" class="matrix-live-loading-spinning">');

                // Start the infinite event loop
                return startEventLoop(config, start, mLiveBody, mLive);
            })
            .fail(function() {
                // ERROR. Show "Disconnected." and display error message
                loadingIndicator.text('Disconnected.');
                loadingIndicator.addClass('matrix-live-loading-error');
                mLiveBody.prepend('<div class="matrix-live-error">An error occured loading the live stream. Please reload or try again later.</div>');
            });

    };

  // We add Matrix Live for each <matrix-live> element
  $('matrix-live').each(addMatrixLive);

});
