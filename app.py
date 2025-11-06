from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import spotipy
from spotipy.oauth2 import SpotifyOAuth
import random
import os
from dotenv import load_dotenv
import secrets

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', secrets.token_hex(16))

# Spotify OAuth configuration
SCOPE = ['user-read-playback-state', 'user-modify-playback-state', 
         'playlist-read-private', 'playlist-read-collaborative', 
         'user-read-currently-playing']

def get_spotify_client():
    """Get or create Spotify client for the current session"""
    cache_handler = spotipy.cache_handler.FlaskSessionCacheHandler(session)
    auth_manager = SpotifyOAuth(
        client_id=os.getenv('CLIENT_ID'),
        client_secret=os.getenv('CLIENT_SECRET'),
        redirect_uri=os.getenv('REDIRECT_URI', 'http://localhost:5000/callback'),
        scope=SCOPE,
        cache_handler=cache_handler,
        show_dialog=True
    )
    
    if not auth_manager.validate_token(cache_handler.get_cached_token()):
        return None
    
    return spotipy.Spotify(auth_manager=auth_manager)

@app.route('/')
def index():
    """Main page"""
    return render_template('index.html')

@app.route('/login')
def login():
    """Redirect to Spotify authorization"""
    cache_handler = spotipy.cache_handler.FlaskSessionCacheHandler(session)
    auth_manager = SpotifyOAuth(
        client_id=os.getenv('CLIENT_ID'),
        client_secret=os.getenv('CLIENT_SECRET'),
        redirect_uri=os.getenv('REDIRECT_URI', 'http://localhost:5000/callback'),
        scope=SCOPE,
        cache_handler=cache_handler,
        show_dialog=True
    )
    auth_url = auth_manager.get_authorize_url()
    return redirect(auth_url)

@app.route('/callback')
def callback():
    """Spotify OAuth callback"""
    cache_handler = spotipy.cache_handler.FlaskSessionCacheHandler(session)
    auth_manager = SpotifyOAuth(
        client_id=os.getenv('CLIENT_ID'),
        client_secret=os.getenv('CLIENT_SECRET'),
        redirect_uri=os.getenv('REDIRECT_URI', 'http://localhost:5000/callback'),
        scope=SCOPE,
        cache_handler=cache_handler
    )
    
    if request.args.get("code"):
        auth_manager.get_access_token(request.args.get("code"))
        return redirect(url_for('game'))
    
    return redirect(url_for('index'))

@app.route('/game')
def game():
    """Game page"""
    sp = get_spotify_client()
    if not sp:
        return redirect(url_for('login'))
    
    # Initialize game state if not exists
    if 'games' not in session:
        session['games'] = 0
        session['wins'] = 0
        session['points'] = 0
    
    return render_template('game.html')

@app.route('/api/devices')
def get_devices():
    """Get available Spotify devices"""
    sp = get_spotify_client()
    if not sp:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        devices = sp.devices()
        device_list = [{
            'id': device['id'],
            'name': device['name'],
            'type': device['type'],
            'is_active': device['is_active']
        } for device in devices['devices']]
        return jsonify({'devices': device_list})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/playlist', methods=['POST'])
def load_playlist():
    """Load playlist details"""
    sp = get_spotify_client()
    if not sp:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.json
    playlist_link = data.get('playlist_link')
    
    try:
        playlist_details = sp.playlist(playlist_link)
        session['playlist_id'] = playlist_details['id']
        session['song_count'] = playlist_details['tracks']['total']
        
        return jsonify({
            'success': True,
            'name': playlist_details['name'],
            'song_count': playlist_details['tracks']['total'],
            'image': playlist_details['images'][0]['url'] if playlist_details['images'] else None
        })
    except Exception as e:
        return jsonify({'error': 'Invalid playlist link'}), 400

@app.route('/api/new-song', methods=['POST'])
def new_song():
    """Pick a random song from the playlist"""
    sp = get_spotify_client()
    if not sp:
        return jsonify({'error': 'Not authenticated'}), 401
    
    if 'playlist_id' not in session:
        return jsonify({'error': 'No playlist selected'}), 400
    
    try:
        playlist_id = session['playlist_id']
        song_count = session['song_count']
        
        # Get a random song
        song_number = random.randint(0, song_count - 1)
        offset = song_number
        
        playlist_tracks = sp.playlist_tracks(playlist_id, offset=offset, limit=1)
        track = playlist_tracks['items'][0]['track']
        
        session['current_song'] = {
            'name': track['name'],
            'artist': track['artists'][0]['name'],
            'uri': track['uri'],
            'id': track['id']
        }
        session['current_guess'] = 1
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/play', methods=['POST'])
def play_song():
    """Play the current song for a specified duration"""
    sp = get_spotify_client()
    if not sp:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.json
    device_id = data.get('device_id')
    duration = data.get('duration', 3)
    
    if 'current_song' not in session:
        return jsonify({'error': 'No song selected'}), 400
    
    try:
        song_uri = session['current_song']['uri']
        sp.start_playback(device_id=device_id, uris=[song_uri])
        
        return jsonify({
            'success': True,
            'duration': duration
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/pause', methods=['POST'])
def pause_song():
    """Pause playback"""
    sp = get_spotify_client()
    if not sp:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        sp.pause_playback()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/search', methods=['POST'])
def search_songs():
    """Search for songs"""
    sp = get_spotify_client()
    if not sp:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.json
    query = data.get('query')
    offset = data.get('offset', 0)
    
    try:
        results = sp.search(query, limit=10, offset=offset)
        songs = [{
            'name': track['name'],
            'artist': track['artists'][0]['name'],
            'id': track['id']
        } for track in results['tracks']['items']]
        
        return jsonify({'songs': songs})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/guess', methods=['POST'])
def make_guess():
    """Check if the guess is correct"""
    sp = get_spotify_client()
    if not sp:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.json
    guessed_name = data.get('name')
    guessed_artist = data.get('artist')
    
    if 'current_song' not in session:
        return jsonify({'error': 'No song to guess'}), 400
    
    current_song = session['current_song']
    correct = (guessed_name == current_song['name'] and 
               guessed_artist == current_song['artist'])
    
    if correct:
        session['wins'] = session.get('wins', 0) + 1
        points_earned = 7 - session['current_guess']
        session['points'] = session.get('points', 0) + points_earned
        
        return jsonify({
            'correct': True,
            'song_name': current_song['name'],
            'artist': current_song['artist'],
            'guesses': session['current_guess'],
            'points_earned': points_earned
        })
    else:
        session['current_guess'] = session.get('current_guess', 1) + 1
        
        return jsonify({
            'correct': False,
            'guesses_left': 7 - session['current_guess']
        })

@app.route('/api/skip', methods=['POST'])
def skip_song():
    """Skip the current song"""
    if 'current_song' not in session:
        return jsonify({'error': 'No song to skip'}), 400
    
    current_song = session['current_song']
    session['games'] = session.get('games', 0) + 1
    
    return jsonify({
        'song_name': current_song['name'],
        'artist': current_song['artist']
    })

@app.route('/api/stats')
def get_stats():
    """Get current game statistics"""
    games = session.get('games', 0)
    wins = session.get('wins', 0)
    points = session.get('points', 0)
    
    win_percentage = (wins / games * 100) if games > 0 else 0
    points_percentage = (points / (games * 6) * 100) if games > 0 else 0
    
    return jsonify({
        'games': games,
        'wins': wins,
        'points': points,
        'win_percentage': round(win_percentage, 1),
        'points_percentage': round(points_percentage, 1)
    })

@app.route('/api/end-game', methods=['POST'])
def end_game():
    """Mark game as played"""
    session['games'] = session.get('games', 0) + 1
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(debug=True, port=5000)

# Export app for Vercel
app = app
