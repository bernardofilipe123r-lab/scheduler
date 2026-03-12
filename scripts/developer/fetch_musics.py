import yt_dlp
import re

# paste your songs list here
songs_text = """
Biquini Cavadinho - Mc Kevin O Chris & MC Vitinho Avassalador & DJ CZ
Xota, Agua, Xau, Bom Dia - Danado do Recife & Escama Reels & Zoinho no Beat & Mc Lysa
Mulher Maravilha - Dadá Boladão
Coloca As Inimigas No Devido Lugar - DJ Vintena
Pega Aquí Vol 10 - Taanga Producciones
RITMADA SAYONARA - RXYET & MC Flavinho
Hero - Meego
Taco Lá Dentro - cjnobeat & Mc Gw & Mc Donzela
MONTAGEM COMA - ANDROMEDA & elysian
Who's That Calling - Olga Myko
"""

songs = [s.strip() for s in songs_text.split("\n") if s.strip()]

ydl_opts = {
    'format': 'bestaudio/best',
    'outtmpl': 'downloads/%(title)s.%(ext)s',
    'noplaylist': True,
    'quiet': False,
    'postprocessors': [{
        'key': 'FFmpegExtractAudio',
        'preferredcodec': 'mp3',
        'preferredquality': '192',
    }]
}

def download_song(query):
    search = f"ytsearch1:{query}"

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([search])


for song in songs:
    print(f"Downloading: {song}")
    download_song(song)
