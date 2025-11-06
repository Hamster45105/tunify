// Game State
let player = null;
let deviceId = null;
let currentGuess = 1;
let currentDuration = 3;
let isPlaying = false;
let playbackTimeout = null;

const guessDurations = {
    1: 3,
    2: 5,
    3: 8,
    4: 11,
    5: 15,
    6: 20
};

// Initialize Spotify Web Playback SDK
window.onSpotifyWebPlaybackSDKReady = () => {
    console.log('Spotify Web Playback SDK is ready');
    initializePlayer();
};

async function initializePlayer() {
    try {
        player = new Spotify.Player({
            name: 'Tunify Web Player',
            getOAuthToken: async cb => { 
                // This callback is called whenever the SDK needs a token
                // It will automatically refresh when needed
                try {
                    const tokenResponse = await apiCall('/api/token');
                    cb(tokenResponse.access_token);
                } catch (error) {
                    console.error('Error getting token:', error);
                }
            },
            volume: 0.5
        });

        // Error handling
        player.addListener('initialization_error', ({ message }) => { 
            console.error('Initialization error:', message); 
        });
        player.addListener('authentication_error', ({ message }) => { 
            console.error('Authentication error:', message);
            // Don't show alert - SDK will retry with fresh token
        });
        player.addListener('account_error', ({ message }) => { 
            console.error('Account error:', message);
            alert('Spotify Premium is required to play songs. Please upgrade your account.');
        });
        player.addListener('playback_error', ({ message }) => { 
            console.error('Playback error:', message); 
        });

        // Ready
        player.addListener('ready', ({ device_id }) => {
            console.log('Ready with Device ID', device_id);
            deviceId = device_id;
        });

        // Not Ready
        player.addListener('not_ready', ({ device_id }) => {
            console.log('Device ID has gone offline', device_id);
        });

        // Player state changed
        player.addListener('player_state_changed', (state) => {
            if (!state) return;
            console.log('Player state:', state);
        });

        // Connect to the player
        const connected = await player.connect();
        if (connected) {
            console.log('Successfully connected to Spotify!');
        }
    } catch (error) {
        console.error('Error initializing player:', error);
        alert('Error connecting to Spotify. Please refresh the page.');
    }
}

// Utility Functions
function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

function showPhase(phaseName) {
    document.querySelectorAll('.phase').forEach(phase => {
        phase.classList.remove('active');
    });
    document.getElementById(`${phaseName}-phase`).classList.add('active');
}

async function apiCall(endpoint, method = 'GET', data = null) {
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
        }
    };
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    const response = await fetch(endpoint, options);
    return await response.json();
}

// Update Stats
async function updateStats() {
    const stats = await apiCall('/api/stats');
    document.getElementById('games-count').textContent = stats.games;
    document.getElementById('wins-count').textContent = stats.wins;
    document.getElementById('points-count').textContent = stats.points;
    document.getElementById('win-percentage').textContent = stats.win_percentage + '%';
}

// Playlist Functions
async function loadPlaylist() {
    const playlistLink = document.getElementById('playlist-link').value.trim();
    
    if (!playlistLink) {
        alert('Please enter a playlist link!');
        return;
    }
    
    showLoading();
    
    try {
        const result = await apiCall('/api/playlist', 'POST', { playlist_link: playlistLink });
        
        if (result.success) {
            // Show playlist info
            const playlistInfo = document.getElementById('playlist-info');
            document.getElementById('playlist-name').textContent = result.name;
            document.getElementById('playlist-song-count').textContent = 
                `${result.song_count} songs`;
            
            if (result.image) {
                document.getElementById('playlist-image').src = result.image;
            }
            
            playlistInfo.classList.remove('hidden');
            
            // Show start button directly (no device selection needed)
            document.getElementById('start-section').style.display = 'block';
        } else {
            alert('Failed to load playlist: ' + result.error);
        }
    } catch (error) {
        alert('Error loading playlist: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Game Functions
async function startGame() {
    if (!deviceId) {
        alert('Player not ready yet. Please wait a moment and try again.');
        return;
    }
    
    showLoading();
    
    try {
        const result = await apiCall('/api/new-song', 'POST');
        // Store the song URI for playback
        sessionStorage.setItem('currentSongUri', result.uri);
        currentGuess = 1;
        updateGuessCounter();
        showPhase('game');
    } catch (error) {
        alert('Error starting game: ' + error.message);
    } finally {
        hideLoading();
    }
}

function updateGuessCounter() {
    document.getElementById('guess-counter').textContent = `Guess ${currentGuess}/6`;
    const progress = (currentGuess / 6) * 100;
    document.getElementById('progress-fill').style.width = progress + '%';
}

async function playSong() {
    if (!deviceId || isPlaying) return;
    
    isPlaying = true;
    currentDuration = guessDurations[currentGuess];
    
    const playBtn = document.getElementById('play-btn');
    playBtn.disabled = true;
    playBtn.textContent = `🎵 Playing (${currentDuration}s)...`;
    
    try {
        const songUri = await getCurrentSongUri();
        
        // Ask backend to start playback on the SDK device (keeps logic in Python)
        const result = await apiCall('/api/play', 'POST', { device_id: deviceId, duration: currentDuration });
        if (!result || result.error) {
            throw new Error(result?.error || 'Failed to start playback');
        }
        
        // Pause after specified duration
        playbackTimeout = setTimeout(() => {
            player.pause();
            
            playBtn.style.display = 'none';
            document.getElementById('repeat-btn').style.display = 'inline-block';
            document.getElementById('search-section').style.display = 'block';
            
            isPlaying = false;
        }, currentDuration * 1000);
        
    } catch (error) {
        console.error('Error playing song:', error);
        alert('Error playing song: ' + error.message);
        playBtn.disabled = false;
        playBtn.textContent = '▶️ Play Song';
        isPlaying = false;
    }
}

async function repeatSong() {
    if (isPlaying) return;
    
    const repeatBtn = document.getElementById('repeat-btn');
    repeatBtn.disabled = true;
    isPlaying = true;
    
    try {
        // Ask backend to (re)start playback on the SDK device from beginning
        const result = await apiCall('/api/play', 'POST', { device_id: deviceId, duration: currentDuration });
        if (!result || result.error) {
            throw new Error(result?.error || 'Failed to start playback');
        }
        
        // Pause after duration
        playbackTimeout = setTimeout(() => {
            player.pause();
            repeatBtn.disabled = false;
            isPlaying = false;
        }, currentDuration * 1000);
        
    } catch (error) {
        console.error('Error playing song:', error);
        alert('Error playing song: ' + error.message);
        repeatBtn.disabled = false;
        isPlaying = false;
    }
}

// Note: Web Playback SDK handles its own token via getOAuthToken callback.

// Helper to get current song URI from backend
async function getCurrentSongUri() {
    // We need to add an endpoint that returns the current song URI
    // For now, we'll store it in session storage when a new song is picked
    return sessionStorage.getItem('currentSongUri');
}

function handleSearchKeyup(event) {
    if (event.key === 'Enter') {
        searchSongs();
    }
}

async function searchSongs() {
    const query = document.getElementById('search-input').value.trim();
    
    if (!query) {
        alert('Please enter a search query!');
        return;
    }
    
    showLoading();
    
    try {
        const result = await apiCall('/api/search', 'POST', { query: query });
        displaySearchResults(result.songs);
    } catch (error) {
        alert('Error searching songs: ' + error.message);
    } finally {
        hideLoading();
    }
}

function displaySearchResults(songs) {
    const resultsDiv = document.getElementById('search-results');
    resultsDiv.innerHTML = '';
    
    if (songs.length === 0) {
        resultsDiv.innerHTML = '<p>No results found. Try a different search.</p>';
        return;
    }
    
    songs.forEach((song, index) => {
        const songItem = document.createElement('div');
        songItem.className = 'song-item';
        songItem.onclick = () => makeGuess(song.name, song.artist);
        
        songItem.innerHTML = `
            <div class="song-name">${index + 1}. ${song.name}</div>
            <div class="song-artist">${song.artist}</div>
        `;
        
        resultsDiv.appendChild(songItem);
    });
}

async function makeGuess(songName, artistName) {
    showLoading();
    
    try {
        const result = await apiCall('/api/guess', 'POST', { 
            name: songName,
            artist: artistName
        });
        
        if (result.correct) {
            showResult(true, result);
        } else {
            if (currentGuess >= 6) {
                // Game over - skip to show answer
                const skipResult = await apiCall('/api/skip', 'POST');
                showResult(false, skipResult);
            } else {
                // Wrong guess, try again
                currentGuess++;
                updateGuessCounter();
                
                // Reset for next guess
                document.getElementById('play-btn').style.display = 'inline-block';
                document.getElementById('play-btn').disabled = false;
                document.getElementById('play-btn').textContent = '▶️ Play Song';
                document.getElementById('repeat-btn').style.display = 'none';
                document.getElementById('search-section').style.display = 'none';
                document.getElementById('search-input').value = '';
                document.getElementById('search-results').innerHTML = '';
                
                alert(`❌ Wrong guess! You have ${result.guesses_left} guesses left.`);
            }
        }
    } catch (error) {
        alert('Error making guess: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function skipSong() {
    if (!confirm('Are you sure you want to skip this song?')) {
        return;
    }
    
    showLoading();
    
    try {
        const result = await apiCall('/api/skip', 'POST');
        showResult(false, result);
    } catch (error) {
        alert('Error skipping song: ' + error.message);
    } finally {
        hideLoading();
    }
}

function showResult(isCorrect, result) {
    // Hide game controls
    document.getElementById('search-section').style.display = 'none';
    document.querySelector('.game-actions').style.display = 'none';
    
    // Show result
    const resultSection = document.getElementById('result-section');
    const resultMessage = document.getElementById('result-message');
    
    if (isCorrect) {
        resultMessage.className = 'result-message success';
        resultMessage.innerHTML = `
            <h3>✔️ Congratulations!</h3>
            <p>You guessed the song in ${result.guesses} guess${result.guesses > 1 ? 'es' : ''}!</p>
            <p><strong>${result.song_name}</strong> by ${result.artist}</p>
            <p>Points earned: ${result.points_earned}</p>
        `;
    } else {
        resultMessage.className = 'result-message failure';
        resultMessage.innerHTML = `
            <h3>❌ Better luck next time!</h3>
            <p>The song was:</p>
            <p><strong>${result.song_name}</strong> by ${result.artist}</p>
        `;
    }
    
    resultSection.style.display = 'block';
    updateStats();
}

async function playAgain() {
    showLoading();
    
    try {
        await apiCall('/api/end-game', 'POST');
        const result = await apiCall('/api/new-song', 'POST');
        
        // Store the new song URI
        sessionStorage.setItem('currentSongUri', result.uri);
        
        // Reset game state
        currentGuess = 1;
        updateGuessCounter();
        
        // Reset UI
        document.getElementById('play-btn').style.display = 'inline-block';
        document.getElementById('play-btn').disabled = false;
        document.getElementById('play-btn').textContent = '▶️ Play Song';
        document.getElementById('repeat-btn').style.display = 'none';
        document.getElementById('search-section').style.display = 'none';
        document.getElementById('result-section').style.display = 'none';
        document.getElementById('search-input').value = '';
        document.getElementById('search-results').innerHTML = '';
        document.querySelector('.game-actions').style.display = 'flex';
        
        updateStats();
    } catch (error) {
        alert('Error starting new game: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function endGame() {
    showLoading();
    
    try {
        await apiCall('/api/end-game', 'POST');
        const stats = await apiCall('/api/stats');
        
        // Show results
        document.getElementById('final-games').textContent = stats.games;
        document.getElementById('final-wins').textContent = stats.wins;
        document.getElementById('final-points').textContent = stats.points;
        document.getElementById('final-win-percentage').textContent = stats.win_percentage + '%';
        document.getElementById('final-points-percentage').textContent = stats.points_percentage + '%';
        
        showPhase('results');
    } catch (error) {
        alert('Error ending game: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateStats();
});
