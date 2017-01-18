/******************************************************************************
 *                                                                            *
 *  Matrix Live is a liveblogging utility built on top of Matrix.             *
 *                                                                            *
 ******************************************************************************/


// We find the matrix-live event after the page has completed loading.
$( document ).ready(function() {

  /*****************************************************************************/
  /* HELPER FUNCTIONS FOR MATRIX AND GENERAL HELPERS                           */
  /*****************************************************************************/

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

  // Room members hash
  var roomMembers = {};

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


  // Post update
  var processEvent = function(config, matrixEvent, mLiveBody, isUpdate) {
    var newEntry, match, match2, myServerName, myMediaId, thumbnailServerName, thumbnailMediaId, linkNeeded, messageHtml;

    if(matrixEvent.type === 'm.room.message' && matrixEvent.content && matrixEvent.content.msgtype === 'm.text') {
      // Ok, display message.
      messageHtml = marked(matrixEvent.content.body, { sanitize: true });

      // We replace YouTube, Vimeo and DailyMotion videos with their embed codes
      messageHtml = messageHtml.replace(/<img [^>]*src=("[^"]*"|'[^']*')[^>]*>/i, function(fullTag, srcAttr) {
        // Is this image referencing a video site?
        if(match = srcAttr.substr(1).match(/^https?:\/\/(www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_]+)/i)) {
          // YouTube
          return '<div class="matrix-live-entry-inline-viewer"><iframe width="480" height="270" src="https://www.youtube.com/embed/' + match[2] + '" frameborder="0" allowfullscreen></iframe></div>';

        } else if(match = srcAttr.substr(1).match(/^https?:\/\/(www\.)?vimeo\.com\/([0-9]+)/i)) {
          // Vimeo
          return '<div class="matrix-live-entry-inline-viewer"><iframe src="https://player.vimeo.com/video/' + match[2] + '?portrait=0" width="480" height="270" frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe></div>';

        } else if(match = srcAttr.substr(1).match(/^https?:\/\/([a-z]+\.)?dailymotion\.com\/video\/([a-z0-9]+)_/i)) {
          // DailyMotion
          return '<div class="matrix-live-entry-inline-viewer"><iframe frameborder="0" width="480" height="270" src="https://www.dailymotion.com/embed/video/' + match[2] + '" allowfullscreen></iframe></div>';
        }

        // No video link, so we return the original image tag
        return fullTag;
      });

      newEntry = $(
        '<div class="matrix-live-entry' + (isUpdate ? ' matrix-live-new' : '') + '" matrix-event-id="' + matrixEvent.event_id.replace(/[^a-zA-Z0-9:\-\._!$%+=]/g, '') + '">' +
          '<div class="matrix-live-entry-body">' + messageHtml + '</div>' +
          '<div class="matrix-live-entry-author"></div>' +
          '<div class="matrix-live-entry-time">' + (new Date(matrixEvent.origin_server_ts)).toLocaleTimeString() + '</div>' +
        '</div>'
      );

      // We set author using text method to avoid XSS
      newEntry.children('.matrix-live-entry-author').text(roomMembers[matrixEvent.sender] === undefined ? matrixEvent.sender : roomMembers[matrixEvent.sender]);

      // Ok, append entry.
      mLiveBody.prepend(newEntry);

    } else if(matrixEvent.type === 'm.room.message' && matrixEvent.content && matrixEvent.content.msgtype === 'm.image') {
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
        '<div class="matrix-live-entry-time">' + (new Date(matrixEvent.origin_server_ts)).toLocaleTimeString() + '</div>' +
        '</div>'
      );

      // We set author using text method to avoid XSS
      newEntry.children('.matrix-live-entry-author').text(roomMembers[matrixEvent.sender] === undefined ? matrixEvent.sender : roomMembers[matrixEvent.sender]);

      mLiveBody.prepend(newEntry);

    } else if(matrixEvent.type === 'm.room.message' && matrixEvent.content && matrixEvent.content.msgtype === 'm.video') {
      // Is the video valid? We need a video URL and a thumbnail ("poster") URL. Otherwise return.
      if((match  = matrixEvent.content.url.match(/^mxc:\/\/([a-zA-Z0-9\.\-]+)\/([0-9a-zA-Z]+)$/i)) &&
        (match2  = matrixEvent.content.info.thumbnail_url.match(/^mxc:\/\/([a-zA-Z0-9\.\-]+)\/([0-9a-zA-Z]+)$/i))) {
        myServerName = match[1];
        myMediaId = match[2];

        thumbnailServerName = match2[1];
        thumbnailMediaId = match2[2];
      } else {
        return;
      }

      // Ok, display HTML5 video with thumbnail as poster.
      newEntry = $(
        '<div class="matrix-live-entry' + (isUpdate ? ' matrix-live-new' : '') + '" matrix-event-id="' + matrixEvent.event_id.replace(/[^a-zA-Z0-9:\-\._!$%+=]/g, '') + '">' +
        '<div class="matrix-live-entry-video">' +
          '<video src="' + config.homeserver + '/_matrix/media/r0/download/' + myServerName + '/' + myMediaId + '" poster="' + config.homeserver + '/_matrix/media/v1/download/' + thumbnailServerName + '/' + thumbnailMediaId + '" controls>' +
          ' [ <a href="' + config.homeserver + '/_matrix/media/r0/download/' + myServerName + '/' + myMediaId + '" target="_blank">Play Video</a> ]' +
          '</video>' +
        '</div>' +
        '<div class="matrix-live-entry-author"></div>' +
        '<div class="matrix-live-entry-time">' + (new Date(matrixEvent.origin_server_ts)).toLocaleTimeString() + '</div>' +
        '</div>'
      );

      // We set author using text method to avoid XSS
      newEntry.children('.matrix-live-entry-author').text(roomMembers[matrixEvent.sender] === undefined ? matrixEvent.sender : roomMembers[matrixEvent.sender]);

      mLiveBody.prepend(newEntry);

    } else if(matrixEvent.type === 'm.room.message' && matrixEvent.content && matrixEvent.content.msgtype === 'm.file') {

      // Is the file URL valid? Otherwise return.
      if(match = matrixEvent.content.url.match(/^mxc:\/\/([a-zA-Z0-9\.\-]+)\/([0-9a-zA-Z]+)$/i)) {
        myServerName = match[1];
        myMediaId = match[2];
      } else {
        return;
      }

      // Ok, display link to download this file.
      newEntry = $(
        '<div class="matrix-live-entry' + (isUpdate ? ' matrix-live-new' : '') + '" matrix-event-id="' + matrixEvent.event_id.replace(/[^a-zA-Z0-9:\-\._!$%+=]/g, '') + '">' +
        '<div class="matrix-live-entry-file">' +
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 120 120" xml:space="preserve"> <polygon points="48.732,69.783 91.039,27.476 102.778,39.215 60.472,81.527 "/><rect x="50.999" y="3.424" width="19.055" height="60.21"/> <polygon points="60.543,81.572 18.22,39.283 29.941,27.542 72.271,69.85 "/> <rect x="9" y="99.575" width="103" height="17"/> <rect x="5.5" y="68.576" width="17" height="48"/> <rect x="97.5" y="68.576" width="17" height="48"/></svg>' +
        '<a href="' + config.homeserver + '/_matrix/media/r0/download/' + myServerName + '/' + myMediaId + '" target="_blank">Download <span class="matrix-live-filename"></span> (' + formatBytes(matrixEvent.content.info.size) + ') </a>' +
        '</div>' +
        '<div class="matrix-live-entry-author"></div>' +
        '<div class="matrix-live-entry-time">' + (new Date(matrixEvent.origin_server_ts)).toLocaleTimeString() + '</div>' +
        '</div>'
      );

      // We set filename using text method to avoid XSS
      newEntry.find('.matrix-live-filename').text(matrixEvent.content.body);


      // We set author using text method to avoid XSS
      newEntry.children('.matrix-live-entry-author').text(roomMembers[matrixEvent.sender] === undefined ? matrixEvent.sender : roomMembers[matrixEvent.sender]);

      mLiveBody.prepend(newEntry);

    } else if(matrixEvent.type === 'm.room.member' && matrixEvent.membership === 'join' && matrixEvent.content && matrixEvent.content.displayname !== undefined) {
      // Add new room member to room member list
      roomMembers[matrixEvent.user_id] = matrixEvent.content.displayname;

    } else if(matrixEvent.type === 'm.room.redaction') {
      // Remove item for this redaction
      mLiveBody.find('.matrix-live-entry[matrix-event-id="' + matrixEvent.redacts.replace(/[^a-zA-Z0-9:\-\._!$%+=]/g, '') + '"]').remove();

    }


    //{
    //  "origin_server_ts": 1480001354056,
    //  "sender": "@mikos:matrix.org",
    //  "event_id": "$148000135450283CEnnJ:matrix.org",
    //  "age": 1396482,
    //  "unsigned":
    //  {
    //    "age": 1396482
    //  },
    //  "content":
    //  {
    //    "body": "But now I cant verify Web device from Android, I see yellow triangle with exclamation mark, but unlike in Web client, I cant find option to verify device",
    //    "msgtype": "m.text"
    //  },
    //  "room_id": "!cURbafjkfsMDVwdRDQ:matrix.org",
    //  "user_id": "@mikos:matrix.org",
    //  "type": "m.room.message"
    //},
  };


  // Perform initial sync
  var getInitialSync = function(config, mLiveBody, secondTry) {
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
              if(state.type === 'm.room.member' && state.content && state.content.displayname !== undefined) {
                roomMembers[state.user_id] = state.content.displayname;
              }
            });

            // Process all events
            res.messages.chunk.forEach(function(evt) { processEvent(config, evt, mLiveBody, false); });

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
  var startEventLoop = function(config, initialStart, mLiveBody) {
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
            res.chunk.forEach(function(evt) { processEvent(config, evt, mLiveBody, true); });

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

    // Gather configuration from element attributes

    // Default configuration:
    var config = {};
    config.homeserver = origElement.attr('homeserver') || 'https://matrix.org';
    config.room = origElement.attr('room');
    config.show_footer = (origElement.attr('show-footer') !== 'false');
    config.initial_load = ($.isNumeric(origElement.attr('initial-load')) ? origElement.attr('initial-load') : 60);

    // Remove trailing slash from homeserver URL
    config.homeserver = config.homeserver.replace(/\/$/, '');

    // Replace element with Matrix Live HTML
    var mLive = $(
      '<div class="matrix-live-main">' +
      '<div class="matrix-live-loading">Loading...</div>' +
      '<div class="matrix-live-body"></div>' +
      (config.show_footer ? '<div class="matrix-live-footer"><a href="https://live.hello-matrix.net/" target="_blank">Powered by Matrix Live</a></div>' : '') +
      '</div>'
    );

    origElement.replaceWith(mLive);


    var loadingIndicator = mLive.children('.matrix-live-loading');
    var mLiveBody = mLive.children('.matrix-live-body');


    // Obtain auth token as guest
    config.access_token = undefined;
    getAuthToken(config)
      .then(function() {
        // Obtain initial sync for room
        return getInitialSync(config, mLiveBody);
      })
      .then(function(start) {
        // Switch loading indicator to spinning wheel
        loadingIndicator.html('Streaming live... &nbsp;&nbsp;&nbsp; <img width="12" height="12" src="data:image/gif;base64,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" class="matrix-live-loading-spinning">');

        // Start the infinite event loop
        return startEventLoop(config, start, mLiveBody);
      })
      .fail(function() {
        // ERROR. Show "Disconnected." and display error message
        loadingIndicator.text('Disconnected.');
        loadingIndicator.addClass('matrix-live-loading-error');
        mLiveBody.prepend('<div class="matrix-live-error">An error occured loading the live stream. Please reload or try again later.</div>');
      });


    // We are all done!

  };

  // We add Matrix Live for each <matrix-live> element
  $('matrix-live').each(addMatrixLive);

});



