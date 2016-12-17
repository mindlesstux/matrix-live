/******************************************************************************
 *                                                                            *
 *  This generator supports testing the parameters for Matrix Live and        *
 *  generating the code used to link to or embed Matrix Live for a given      *
 *  homeserver and room.                                                      *
 *                                                                            *
 ******************************************************************************/


/*****************************************************************************/
/* GENERATE FUNCTION THAT TESTS CONNECTION AND GENERATES CODE                */
/*****************************************************************************/

generateMatrixLive = function() {
  // Fill configuration
  var homeserverWithoutHTTPS = $('#homeserver').val();
  var initialLoadRaw = $('#initial_load').val();
  var pageTitle = $('#page_title').val();

  var config = {
    homeserver: 'https://' + homeserverWithoutHTTPS,
    room: $('#room').val(),
    initial_load: ($.isNumeric(initialLoadRaw) ? initialLoadRaw : 60)
  };


  // Ok, test connection by obtaining auth token and room preview

  // Disable generate button
  var generateButtonText = $('#generate-button').val();
  $('#generate-button').prop('disabled', true);
  $('#generate-button').val('Testing - Please wait and see progress below...');

  // Hide code and link (if we have already shown it before)
  $('.generate-results').addClass('generate-hidden');

  // Clear progress (if we have already added anything there)
  $('.generate-progress').html('');


  logProgress('msg', 'Trying to obtain guest access from homeserver ' + config.homeserver + '...');
  testAccessToken(config)
    .then(
      function(access_token) {
        logProgress('msg', 'Successfully obtained guest access token.');
        logProgress('msg', 'Trying to retrieve room preview for room ' + config.room + '...');
        return testInitialSync(access_token, config);
      }
    )
    .then(
      function() {
        var urlMatch, myPath;
        logProgress('msg', 'Successfully obtained room preview.');
        logProgress('success', 'We have successfully tested your configuration. Please find the Matrix Live link and embed code below.');

        // Calculate target URLs based on where we are located at
        if(urlMatch = window.location.href.split('#')[0].match(/^(.+)\/(.*?)$/)) {
          myPath = urlMatch[1];
        } else {
          myPath = 'https://live.hello-matrix.net';
        }

        // Fill in results
        $('.generate-link').html(
          '<a href="' + myPath + '/live.html#' + encodeURIComponent(homeserverWithoutHTTPS) + '/' + encodeURIComponent(config.room) + (pageTitle !== '' ? '/' + encodeURIComponent(pageTitle) : '') + '" target="_blank">Matrix Live</a>'
        );

        if($('#page_title').val() !== '') {
          $('.generate-link a').text($('#page_title').val());
        }

        $('.generate-code').text(
          '<matrix-live homeserver="https://' + homeserverWithoutHTTPS + '"\n' +
          '             room="' + config.room + '"' +
          ($.isNumeric(initialLoadRaw) ? '\n             initial-load="' + initialLoadRaw + '"' : '') +
          '></matrix-live>'
        );

        $('.generate-code-bottom').text(
          ($('#jquery-yes').prop('checked') ? '<script src="https://code.jquery.com/jquery-3.1.1.min.js"\n' +
                                              '        integrity="sha256-hVVnYaiADRTO2PzUGmuLJr8BLUSjGIZsDYGmIJLv2b8="\n' +
                                              '        crossorigin="anonymous"></script>\n' : '') +
          '<script src="' + myPath + '/matrix-live-min.js"></script>'
        );

        $('.generate-code-css').text(
          '<link rel="stylesheet" type="text/css" href="' + myPath + '/matrix-live.css">'
        );

        // Unhide results
        $('.generate-results').removeClass('generate-hidden');

        // Scroll to results
        $('.generate-results').get(0).scrollIntoView();

        // Re-enable button
        $('#generate-button').prop('disabled', false);
        $('#generate-button').val(generateButtonText);
      }
    )
    .fail(
      function(err) {
        logProgress('error', err);

        // Re-enable button
        $('#generate-button').prop('disabled', false);
        $('#generate-button').val(generateButtonText);
      }
    );
};


/*****************************************************************************/
/* HELPER FUNCTIONS TO TEST GIVEN PARAMETERS                                 */
/*****************************************************************************/

// Log to generate-progress
var logProgress = function(type, text) {
  var myLi = $('<li class="generate-progress-' + type + '"></li>');
  myLi.text(text);
  $('.generate-progress').append(myLi);
  myLi.get(0).scrollIntoView();
};


// Obtain authorization token for guest access
var testAccessToken = function(config) {
  return $.Deferred(function( defer ) {
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

          defer.reject('The homeserver did not provide an access token. Maybe the domain is wrong or guest access is disabled?');
        } else {
          defer.resolve(res.access_token);
        }
      },
      function(err) {
        console.log('Received error from request when contacting homeserver: ');
        console.log(err);

        if(err.status === 0) {
          // Server did not respond / hostname is invalid
          defer.reject('No homeserver responds at the given domain. Are you sure this is the valid domain? Can you connect with Riot and a custom URL of https://' + config.homeserver + '/?');
        } else if(err.status === 403) {
          defer.reject('The homeserver does not provide guest access tokens. Are you sure that guest access is enabled?');
        } else if(err.status >= 400 && err.status <= 499) {
          defer.reject('No homeserver API responded at the given domain. Are you sure this is the valid domain?');
        } else if(err.status >= 500) {
          defer.reject('The homeserver responded with an internal error. Are you sure it is working properly? Is the domain correct?');
        } else {
          defer.reject('The homeserver did not provide an access token. Maybe the domain is wrong or guest access is disabled?');
        }
      }

    );
  }).promise();
};


// Test initial sync
var testInitialSync = function(access_token, config) {
  return $.Deferred(function( defer ) {
    $.ajax({
      url: config.homeserver + '/_matrix/client/r0/rooms/' + encodeURIComponent(config.room) + '/initialSync?limit=' + config.initial_load + '&access_token=' + encodeURIComponent(access_token),
      type: 'GET',
      dataType : 'json'
    }).then(
      function(res) {
        if(!res.messages || !res.messages.chunk || !Array.isArray(res.messages.chunk) || !res.state || !Array.isArray(res.state)) {
          console.log('Received strange response from matrix: ');
          console.log(res);

          defer.reject('The homeserver did not return room contents. Maybe the room ID is wrong or the room does not allow Room Previews?');
        } else {
          defer.resolve();
        }
      },
      function(err) {
        console.log('Received error from request when trying initial sync: ');
        console.log(err);

        defer.reject('The homeserver did not return room contents. Maybe the room ID is wrong or the room does not allow Room Previews?');
      }
    );
  }).promise();
};



/*****************************************************************************/
/* DONE.                                                                     */
/*****************************************************************************/
