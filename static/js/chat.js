// Enable pusher logging - don't include this in production
Pusher.log = function(message) {
  if (window.console && window.console.log) window.console.log(message);
};

// Flash fallback logging - don't include this in production
WEB_SOCKET_DEBUG = true;

var pusher = new Pusher('f534733a51756cd43eba');
Pusher.channel_auth_endpoint = '/' + uri + '/pusher_auth';
var channel = pusher.subscribe('presence-' + channel_name);

var prev_state = 'initialized';
var modal = 0;

var current_members = [];

pusher.connection.bind('initialized', function() {
  disableMsgField();
});

function disableMsgField() {
  $('#chatbox [name=msg]').attr('disabled', 'disabled');
}

function enableMsgField() {
  $('#chatbox [name=msg]').removeAttr('disabled');
}

pusher.connection.bind('connecting', function() {
  data = {
    title: 'Connecting',
    body: 'We are trying to connect you with the people you are trying to talk to.',
  };

  disableMsgField();
  setStatus(data.title);
  modalShow(data);
});

pusher.connection.bind('connected', function() {
});

pusher.connection.bind('disconnected', function() {
  data = {
    title: 'Disconnected',
    body: 'You are currently not connected with your chat session. We are trying to connect you.',
  };

	disableMsgField();
  setStatus(data.title, 'alert-error');
  modalShow(data);
});

pusher.connection.bind('unavailable', function() {
  data = {
    title: 'Unaivalable',
    body: 'Looks like ChattrBox is unavailable due to problems with your internet connection or perhaps our server is down.',
  };

	disableMsgField();
  setStatus(data.title, 'alert-error');
  modalShow(data);
});

pusher.connection.bind('failed', function() {
	disableMsgField();
});

// When the user changes his/her own nick
channel.bind('user_rename', function(data) {
  appendMessage('<strong>' + data.nick_old + '</strong> is now known as <strong>' + data.user + '</strong>!', 'info');

  $('.participant[user-nick=' + data.nick_old + ']').html(data.user);
  $('.participant[user-nick=' + data.nick_old + ']').attr('user-nick', data.user);

  if ($('#nick span').text() == data.nick_old) {
    $('#nick span').text(data.user);
    nick = data.user;
  }

  addToLocalStorage($('#messages').html(), 'replace');
});

function getCurrentTime() {
  var current = new Date();
  var minutes = current.getMinutes(), hours = current.getHours();


  if ((minutes/10) < 1) {
    minutes = '0' + minutes;
  }
  if (!(hours/10)) {
    hours = '0' + hours;
  }
  return '[' + hours + ':' + minutes + ']'
}

// When member successfully joins the channel
channel.bind('pusher:subscription_succeeded', function(members) {
  addUser(members.me);
  members.each(function(member) {
    if (member.id != members.me.id) {
      addUser(member);
    }
  });
	enableMsgField();
  modalHide();
  setStatus('Connected', 'alert-success');
});

// When a member is added to the channel
channel.bind('pusher:member_added', function(member) {
  addUser(member);
  user_join(member.info);
});

// When another member leaves the channel
channel.bind('pusher:member_removed', function(member) {
  $.ajax({
    url: '/' + uri + '/check_session',
    type: 'GET',
  }).done(function(data) {
    if (data == 'error') {
      $('.participant[user-nick=' + data.user + ']').remove();
      $('#messages').append('<div class="alert alert-error" user-nick="' + data.user + '" style="display: none; margin: 10px 0;"></div>');
      $('#messages .alert-error[user-nick=' + data.user + ']').html('<strong>' + data.user + '</strong> has left this chat session.').fadeIn(400);
      addToLocalStorage($('#messages').html(), 'replace');
    }
  });
  removeUser(member);
});

// When a user deliberately leaves the session
channel.bind('user_disconnect', function(data) {
  user_disconnect(data);
});

// When a message is received
channel.bind('receive_message', function(data) {
  receive_message(data);
});

///////////////
// FUNCTIONS //
///////////////

function json_alert(msg) { alert(JSON.stringify(msg)); }

function addUser(member) {
  current_members.push(member);
}

function removeUser(member) {
  for (var i = 0; i < current_members.length; i++) {
    if (member.id == current_members[i].id) {
      current_members.splice(i, 1);
    }
  }
}
function modalShow(data) {
  if (typeof(data) != 'object') {
    Pusher.log('Incorrect data passed to modalShow(). data has to be JSON object.');
    return;
  }

  $('#pusher_status_modal h3').text(data.title);
  $('#pusher_status_modal p').text(data.body);

  if (!modal && $('#pusher_status_modal').length) {
    modal = 1;
    $('#pusher_status_modal').modal('show');
  }
}

function modalHide() {
  if (modal) {
    modal = 0;
    $('#pusher_status_modal').modal('hide');
  }
}

function setStatus(connection_status, class_type) {
  $('.row-fluid > .span12 > div .alert > strong').text(connection_status);
  var classList = $('.row-fluid > .span12 > div .alert').attr('class').split(/\s+/);
  for (var i = 0; i < classList.length; i++) {
    if (classList[i].match(/alert\-/g)) {
      $('.row-fluid > .span12 > div .alert').removeClass(classList[i]);
    }
  }
  $('.row-fluid > .span12 > div .alert').addClass(class_type);
}

function receive_message(data) {
  if (data.user != nick) {
    receiveMessage(data);
  }
}

function receiveMessage(data) {
  appendMessage('<strong>' + data.user + '</strong>: ' + data.msg);
}

function appendMessage(data, type) {
  if (!type) {
    type = 'none';
  }

  var append_data = '';
  if (type == 'none') {
    append_data += '<div>';
  } else {
    append_data += '<div style="margin-top: 5px; margin-bottom: 5px;">';
  }
  append_data += '<div class="alert alert-' + type + ' time" style="display: inline-block; margin: 0;">';
  append_data += getCurrentTime();
  append_data += '</div>';
  append_data += '<div class="alert alert-' + type + '" style="margin: 0; display: inline-block;">' + data + '</div>';
  append_data += '</div>';
  $('#messages').append(append_data);

  document.getElementById('messages').scrollTop = $('#messages > div').length * $('#messages > div').height();
  //addToLocalStorage(append_data);
}

// Valid actions are 'append' and 'replace'
function addToLocalStorage(data, action) {
  if ((!action) || (action == 'append')) {
    var append_data = data;
    var data = '';
    var tmp = window.localStorage.getItem('presence-' + uri + '-' + nick);
    if (tmp) {
      data += tmp;
    }
    data += append_data;
  } else if (action == 'replace') {
    ;
  }
  window.localStorage.setItem('presence-' + uri + '-' + nick, data);
}

function user_join(data) {
  if ($('#participants [user-nick=' + data.user + ']').length) {
    ;
  } else {
    var append_data = '<div class="participant" user-nick="' + data.user + '">' + data.user + '</div>';
    $('#participants').append(append_data);

    if (!$('#messages [user-nick=' + data.user + ']').length || $('#notifications [user-nick=' + data.user + ']').css('display') == 'None') {
      appendMessage('<strong>' + data.user + '</strong> just joined in!', 'success');
      addToLocalStorage($('#messages').html(), 'replace');
    }
  }
}

function user_disconnect(data) {
  $('.participant[user-nick=' + data.user + ']').remove();
  appendMessage('<strong>' + data.user + '</strong> has left this chat session.', 'error');
  addToLocalStorage($('#messages').html(), 'replace');
}

function sendMessage(message) {
  if (message) {
    $('#chatbox input[name=msg]').val('');
    receiveMessage({user: nick, msg: message});

    $.ajax({
      url: send_message_url,
      type: 'POST',
      data: {msg: message},
    }).done(function() {
      $('#chatbox input[type=button]').addClass('disabled');
    
      $("#chatbox").unbind("submit");
      $("#chatbox").bind("submit", function() {
        return false;
      });
    });
  }
}

$(document).ready(function() {
  var localData = window.localStorage.getItem('presence-' + uri + '-' + nick);
  if (localData) {
    $('#messages').append(localData);
    $('#messages > div').css('opacity', '');
  }

  $('#pusher_status_modal').modal({
    keyboard: false,
    backdrop: 'static',
  });

  $('#chatbox input[type=button]').bind('click', function() {
    sendMessage($('#chatbox input[name=msg]').val());
  });

  $("#chatbox").bind("submit", function() {
    return false;
  });

  $("#myNickRename .modal-body form").bind("submit", function() {
    rename();
    return false;
  });
  $('#myNickRename .modal-footer .btn-success').click(function() {
    rename();
  });

  function rename() {
    $.ajax({
      url: rename_url,
      type: 'POST',
      data: {new_nick: $('#myNickRename .modal-body form input').val()},
    }).done(function ( data ) {
      $('#myNickRename').modal('hide');
    });
  }

  $("#chatbox input[name=msg]").keyup(function() {
    if ($(this).val() == "") {
      $('#chatbox input[type=button]').addClass('disabled');
      $("#chatbox").unbind("submit");
      $("#chatbox").bind("submit", function() {
        return false;
      });
    } else {
      $("#chatbox").unbind("submit");
      $("#chatbox").bind("submit", function() {
        sendMessage($('#chatbox input[name=msg]').val());
        return false;
      });
      $('#chatbox input[type=button]').removeClass('disabled');
    }
  });

  $('#copyURL').popover({
    placement: 'bottom',
    'trigger': 'manual',
    animation: true,
    title: "Chat Session URL",
    content: "Copy this URL and share it with anyone to start chatting.<hr><input type='text' id='copyURL_field' value='http://localhost:5000/" + uri + "'>",
  });

  $('#copyURL').bind('click', function() {
    $(this).popover('toggle');
    $('#copyURL_field').css('width', $('#copyURL_field').siblings('hr').width() - 8);
    document.getElementById('copyURL_field').focus();
    document.getElementById('copyURL_field').select();
    $('.popover').click(function(event){
      event.stopPropagation();
    });
  });

  $(document).keyup(function(e) {
    if (e.keyCode == 27) {
      $('#copyURL').popover('hide');
    }
  });

  $('html').click(function() {
    $('#copyURL').popover('hide');
  });
  $('#copyURL').click(function(event){
    event.stopPropagation();
  });

  $('#myModal .btn-danger').bind('click', function() {
    $.ajax({
      url: '/' + uri + '/close_session',
      type: 'GET',
    }).done(function(data) {
      pusher.unsubscribe('presence-' + uri);

      localStorage.removeItem('presence-' + uri + '-' + nick);
      $('#myModal').modal('hide');

      window.location = '/';
    });
  });

  // Tooltip for all the buttons in the toolbar.
  $('#nick').tooltip({
    placement: 'bottom',
    title: 'You are logged in to this session as ' + nick + '. Click to change your nickname.',
  });
  $('#download_chat').tooltip({
    placement: 'bottom',
    title: 'Download this chat transcript.',
  });
  $('#copyURL').tooltip({
    placement: 'bottom',
    title: "Copy URL to this session.",
  });
  $('#leaveSession').tooltip({
    placement: 'bottom',
    title: "Leave this session.",
  });

  $('#download_chat').bind('click', function() {
    var tmp = document.createElement("DIV");
    tmp.innerHTML = $('#messages').html();
    var chat_data = '';
    $('#messages > div').each(function(message) {
      tmp.innerHTML = $(this).children('div:nth-child(1)').html() + ' ';
      tmp.innerHTML += $(this).children('div:nth-child(2)').html();
      chat_data += tmp.txtContent||tmp.innerText + '\n';
    });

    $.ajax({
      url: '/' + uri + '/download_chat',
      type: 'POST',
      data: {transcript: chat_data},
    }).done(function(data) {
      if (data == 'good') {
        if (!$('body iframe').length) {
          $('body').append('<iframe id="secretIFrame" src="" style="display:none; visibility:hidden;"></iframe>');
        }
        $('body iframe').attr('src', '/' + uri + '/download_chat');
      }
    });
  });

  adjust_participants_column();
  $(window).resize(adjust_participants_column);

  function adjust_participants_column() {
    $('#chat_app > .span3').height($('#chat_app > .span9').height());
    $('#chat_app > .span3 > div').height($('#chat_app > .span3').height() - 40);
  }
});

