'''
ChattrBox: Anonymous chatting.
'''

import hashlib
import os
import pickle
import pusher
import random
import redis
import simplejson as json
import string
import time

from config_local import *

from flask import flash
from flask import Flask
from flask import make_response
from flask import render_template
from flask import redirect
from flask import request
from flask import session
from flask import url_for

r = redis.StrictRedis(host='localhost', port=6379, db=0)

app = Flask(__name__)
app.secret_key = SESSION_SECRET_KEY

pusher.app_id = PUSHER_APP_ID
pusher.key = PUSHER_KEY
pusher.secret = PUSHER_SECRET

p = pusher.Pusher()

@app.route('/')
def home():
    return redirect(url_for('start_session'))


@app.route('/start-session', methods=['GET', 'POST'])
def start_session():
    if request.method == 'POST' and request.form.get('nick', None):
        nick = request.form.get('nick')

        # create URL
        chars = string.ascii_uppercase + string.digits
        uri = ''.join(random.choice(chars) for x in range(10))
        while r.get(uri):
            uri = ''.join(random.choice(chars) for x in range(10))

        # create hash
        r.set(uri, hashlib.sha224(uri).hexdigest())

        return redirect(url_for('join_session', uri = uri, nick = nick))

    return render_template('start_session.html')


@app.route('/<uri>/<nick>', methods = ['GET', 'POST'])
@app.route('/<uri>', methods = ['GET', 'POST'], defaults={'nick': None})
def join_session(uri, nick):
    if not r.get(uri):
        return 'error'

    if 'nick' in session and session['uri'] == uri:
        return redirect(url_for('chat', uri = uri))

    if not nick:
        if request.method == 'POST':
            nick = request.form.get('nick', None)
        else:
            nick = request.args.get('nick', None)

    if nick:
        # add timestamp to the hash
        r.set(hashlib.sha224(nick).hexdigest(),
              {'uri': uri, 'nick': nick})
        r.sadd('%s:users' % uri, nick)
        session['nick'] = nick
        session['uri'] = uri

        return redirect(url_for('chat', uri=uri))

    return render_template('join_session.html',
                           join_session_url = url_for('join_session', uri=uri))


@app.route('/<uri>/check_session', methods=['GET'])
def check_session(uri):
    if 'nick' in session and session['uri'] == uri:
        return 'good'
    else:
        return 'error'


@app.route('/<uri>/pusher_auth', methods = ['POST'])
def pusher_auth(uri):
    channel_name = request.form.get('channel_name')
    socket_id = request.form.get('socket_id')

    channel_data = {'user_id': socket_id}
    channel_data['user_info'] = {'user': session['nick']}

    auth = p[channel_name].authenticate(socket_id, channel_data)
    json_data = json.dumps(auth)
    return json_data


@app.route('/<uri>/chat')
def chat(uri):
    if not r.get(uri):
        return 'error'

    if 'nick' not in session:
        return redirect(url_for('join_session', uri = uri))

    if session['uri'] == uri:
        return render_template('chat.html', nick = session['nick'], uri = uri,
                               connected = r.smembers('%s:users' % uri),
                               session_close_url = url_for('close_session',
                                                           uri = uri),
                               rename_url = url_for('rename', uri = uri),
                               send_message_url = url_for('send_msg',
                                                          uri=uri))
    else:
        return redirect(url_for('join_session', uri = uri))


@app.route('/<uri>/rename', methods = ['POST', 'GET'])
def rename(uri):
    if not r.get(uri):
        return 'error'

    if 'nick' not in session:
        return 'not registered'

    if not request.form.get('new_nick', None):
        return 'no new nick supplied'

    nick_new = request.form['new_nick']
    nick_old = session['nick']
    r.srem('%s:users' % uri, session['nick'])
    r.sadd('%s:users' % uri, nick_new)

    session['nick'] = nick_new

    data = {'nick_old': nick_old, 'user': nick_new}
    p['presence-' + uri].trigger('user_rename', data)

    return str(data)


@app.route('/<uri>/download_chat', methods=['POST','GET'])
def download_chat(uri):
    if 'nick' in session:
        file_name = '%s-%s.txt' % (uri, session['nick'])

        if request.method == 'POST':
            r.set(file_name, request.form.get('transcript', ''))

            return 'good'

        if request.method == 'GET':
            response = make_response(r.get(file_name))
            response.headers['Content-disposition'] = 'attachment; filename=' + file_name
            response.headers['Content-type'] = 'application/txt' 

        return response
    else:
        return 'error'


@app.route('/<uri>/close_session')
def close_session(uri):
    if 'nick' in session:
        nick = session['nick']

        r.delete(session['nick'])
        r.srem('%s:users' % uri, session['nick'])

        del session['uri']
        del session['nick']

        p['presence-' + uri].trigger('user_disconnect', {'user': nick})

    else:
        pass

    return 'good close'
    return redirect(url_for('home'))



@app.route('/<uri>/send_msg', methods=['POST'])
def send_msg(uri):
    if session['nick'] and request.form.get('msg'):
        msg= request.form.get('msg')
        p['presence-' + uri].trigger('receive_message', {'user': session['nick'],
                                           'msg': msg})

        return 'Cool'

    return 'asdad' + session['nick'] + request.form.get('msg', 'asdasd123')


if __name__ == '__main__':
    app.run()
