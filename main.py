import spotipy
from spotipy.oauth2 import SpotifyOAuth
import random
import time
import os
from dotenv import load_dotenv

games = 1
wins = 0
points = 0


def game_intro():
    global playlist_details
    global sp
    input('Welcome to Song Guesser! Please press enter to continue! ')
    print('-----')
    print('Authenticating...')

    scope = ['user-read-playback-state', 'user-modify-playback-state', 'playlist-read-private', 'playlist-read-collaborative', 'user-read-currently-playing']

    sp = spotipy.Spotify(auth_manager=SpotifyOAuth(client_id=os.getenv('CLIENT_ID'), client_secret=os.getenv('CLIENT_SECRET'), redirect_uri=cred.redirect_url, scope=scope))

    print('Authentication complete!')
    print('-----')


def pick_playlist():
    global song_count
    global playlist_details
    print('-----')
    playlist_link = input("Now, please enter the link of the playlist you want the songs to be from: ")
    print('-----')

    try:
        playlist_details = sp.playlist(playlist_link, additional_types=['track'])
    except:
        print("Opps! Doesn't look like that is an acutal playlist! Please try again!")
        pick_playlist()

    song_count = playlist_details['tracks']['total']

def pick_device():
    global device_chosen
    print('To play please open up a device with Spotify and ensure that you can\'t see the screen!')

    devices = sp.devices()

    counter = 0

    device_list = {}

    for items in devices['devices']:
        number = counter + 1
        print((str(number) + '. ' + devices['devices'][counter]['name']))
        device_list[int(number)] = devices['devices'][counter]['id']
        counter = counter + 1

    device_chosen = input("The above devices are currently active. Which device do you wish to play on? (Press 'r' to refresh) ")
    if device_chosen == 'r':
        pick_device()
    else:
        device_chosen = device_list[int(device_chosen)]
        print('-----')


def pick_song():
    global song_details
    global song_link
    global song_number
    song_number = random.randint(1,song_count)

    song_details = playlist_details['tracks']['items'][song_number - 1]['track']['name'] + ' by ' + playlist_details['tracks']['items'][song_number - 1]['track']['artists'][0]['name']

    song_link = playlist_details['tracks']['items'][song_number - 1]['track']['uri']
#song_length = playlist_details['tracks']['items'][song_number - 1]['track']['duration_ms']
#song_length = song_length / 1000

#distance = song_length - 20
#picked_length = random.uniform(0, distance)



#Main Loop
def loop(sleep_time):
    global wins
    global items
    while True:
        skip = False
        #position_ms=picked_length*1000
        print("Guess: " + str(guesses))
        sp.start_playback(device_id=device_chosen, uris=[song_link])
        time.sleep(sleep_time)
        sp.pause_playback()
        print('-----')
        search_item = input("What song do you think it is? (Type 'r' to repeat, or 's' to skip) ")
        search_results = sp.search(search_item)
        if search_item == 'r':
            skip = True
        elif search_item == 's':
            skip = True
        if skip != True:
            counter = 0

            song_list = {}
            print('-----')
            while True:
                for items in search_results['tracks']['items'][:10]:
                    number = counter + 1
                    print((str(number) + '. ' + search_results['tracks']['items'][counter]['name'] + ' - ' + search_results['tracks']['items'][counter]['artists'][0]['name']))
                    song_list[int(number)] = search_results['tracks']['items'][counter]['name'] + ' by ' + search_results['tracks']['items'][counter]['artists'][0]['name']
                    counter = counter + 1
                    
                chosen_song = input("Which song is it? (Enter number or 'm' to show more results.) ")
                if chosen_song != 'm':
                    break
                else:
                    search_results = sp.search(search_item, offset=10, limit=50)


            if song_list[int(chosen_song)] == song_details:
                print('✔️ Good job! You guessed the song in ' + str(guesses) + ' guesses!')
                wins = wins + 1
                return True
            else:
                print('❌ Opps, you didn\'t get it that time!')
                break
        elif search_item == 's':
            break

            
#Main Game
game_intro()
pick_device()
pick_playlist()
pick_song()
            
while True:            
    guesses = 1            
    status = loop(3)
    if status != True:
        guesses = 2
        status = loop(5)
        
        if status != True:
            guesses = 3
            status = loop(8)

            if status != True:
                guesses = 4
                status = loop(11)

                if status != True:
                    guesses = 5
                    status = loop(15)

                    if status != True:
                        guesses = 6
                        print('Last guess!')
                        status = loop(20)
                        if status != True:
                            print('Oh no! You didn\'t guess the song! Better luck next time! The song was:')
                            print(song_details)
    sp.start_playback(device_id=device_chosen, uris=[song_link])
    points = points + 7 - guesses
    play_again = input("Would you like to play again? (y/n) ")
    if play_again != 'y':
        break
    else:
        games = games + 1
        pick_song()

result = wins/games*100
result2 = (points/(games*6)*100)
print('Thanks for playing Song Guesser! Here were your results')
print('You played ' + str(games) + ' game/s. Of those you won ' + str(wins) + ' game/s. That\'s a win percentage of ' + str(int(result)) + '%!')
print('You got ' + str(points) + ' points. That\'s a percentage of ' + str(int(result2)) + '%!')