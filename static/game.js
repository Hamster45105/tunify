// Game State
let selectedDevice = null;
let currentGuess = 1;
let currentDuration = 3;
let isPlaying = false;

const guessDurations = {
    1: 3,
    2: 5,
    3: 8,
    4: 11,
    5: 15,
    6: 20
};

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
            
            // Show device section
            document.getElementById('device-section').style.display = 'block';
            await refreshDevices();
        } else {
            alert('Failed to load playlist: ' + result.error);
        }
    } catch (error) {
        alert('Error loading playlist: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Device Functions
async function refreshDevices() {
    showLoading();
    
    try {
        const result = await apiCall('/api/devices');
        const deviceList = document.getElementById('device-list');
        deviceList.innerHTML = '';
        
        if (result.devices.length === 0) {
            deviceList.innerHTML = '<p class="hint">⚠️ No active devices found. Please open Spotify on a device and try again.</p>';
        } else {
            result.devices.forEach(device => {
                const deviceItem = document.createElement('div');
                deviceItem.className = 'device-item';
                deviceItem.onclick = () => selectDevice(device.id, deviceItem);
                
                deviceItem.innerHTML = `
                    <div class="device-name">${device.name}</div>
                    <div class="device-type">${device.type}${device.is_active ? ' (Active)' : ''}</div>
                `;
                
                deviceList.appendChild(deviceItem);
            });
        }
    } catch (error) {
        alert('Error loading devices: ' + error.message);
    } finally {
        hideLoading();
    }
}

function selectDevice(deviceId, element) {
    selectedDevice = deviceId;
    
    // Update UI
    document.querySelectorAll('.device-item').forEach(item => {
        item.classList.remove('selected');
    });
    element.classList.add('selected');
    
    // Show start button
    document.getElementById('start-section').style.display = 'block';
}

// Game Functions
async function startGame() {
    if (!selectedDevice) {
        alert('Please select a device first!');
        return;
    }
    
    showLoading();
    
    try {
        await apiCall('/api/new-song', 'POST');
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
    if (!selectedDevice || isPlaying) return;
    
    isPlaying = true;
    currentDuration = guessDurations[currentGuess];
    
    const playBtn = document.getElementById('play-btn');
    playBtn.disabled = true;
    playBtn.textContent = `🎵 Playing (${currentDuration}s)...`;
    
    try {
        await apiCall('/api/play', 'POST', { 
            device_id: selectedDevice,
            duration: currentDuration
        });
        
        // Wait for duration then pause
        setTimeout(async () => {
            await apiCall('/api/pause', 'POST');
            
            playBtn.style.display = 'none';
            document.getElementById('repeat-btn').style.display = 'inline-block';
            document.getElementById('search-section').style.display = 'block';
            
            isPlaying = false;
        }, currentDuration * 1000);
        
    } catch (error) {
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
        await apiCall('/api/play', 'POST', { 
            device_id: selectedDevice,
            duration: currentDuration
        });
        
        setTimeout(async () => {
            await apiCall('/api/pause', 'POST');
            repeatBtn.disabled = false;
            isPlaying = false;
        }, currentDuration * 1000);
        
    } catch (error) {
        alert('Error playing song: ' + error.message);
        repeatBtn.disabled = false;
        isPlaying = false;
    }
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
        await apiCall('/api/new-song', 'POST');
        
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
