#!/usr/bin/env python3
"""Writes level-<id>.html for every level from one layout (the Kyoto sheet the user signed off on, 2026-11-14).

    python3 make-levels.py && node render-level.mjs kyoto office2 castle lab space inferno lumber

Each level's parts are in assets/<id>/: paint-day / paint-night (the game's two paintings), logo, weapon.png
(node weapon.mjs <id>), headset.jpg (a frame of the Quest footage) and gpt-* (the early GPT image model concepts).
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

# acc: the labels' colour; glow: r,g,b of the level's light; shadow: the name's drop; tint: the backdrop's two lights
LEVELS = {
    'kyoto': dict(
        name='Kyoto Nights', day='paint-dusk.webp', night='paint-night.webp',
        acc='#ffd9e7', glow='255, 95, 162', shadow='#2a1238', tint=('255, 95, 162', '255, 196, 107'), air_bg=('#3a2350', '#140b26'),
        phases=['Dusk', 'Blue hour', 'Twilight'],
        paint_note='One painting wrapped 270° round the player, crossfading from dusk to twilight as the inbox empties',
        weapon='Sakura katana, modelled in code',
        swatches=['#ffc4d8', '#c9a6e6', '#ffb04d', '#bdff5c', '#f3e9d2'],
        air_note='Cherry petals, lantern motes, fireflies and washi scraps off every cut',
        air=[['glow', [255, 176, 77], '#ffe2b0', 26, 6, 16, 0, .9], ['glow', [189, 255, 92], '#f2ffd8', 12, 5, 9, .35, .55],
             ['scraps', ['#f3e9d2', '#b9b1d8'], 9], ['petals', ['#ffc4d8', '#ff9fc0', '#f7c4d8', '#c9a6e6', '#fff0f5'], 70]],
        gpt=[('split', ['gpt-pano-v1.jpg', 'gpt-pano-v1-night.jpg'], 'First 270° garden, dusk and twilight'),
             ('', ['gpt-card-dusk.jpg'], 'Level card, dusk'), ('', ['gpt-card-night.jpg'], 'Level card, night')],
        play='assets/kyoto-headset.jpg', play_at='44% 50%'),
    'office2': dict(
        name='Keyboard Smash', acc='#d2ffe9', glow='70, 255, 190', shadow='#0d2a2a', tint=('70, 255, 190', '255, 196, 107'), air_bg=('#17383a', '#0a1418'),
        phases=['Office hours', 'Closing time', 'After hours'],
        paint_note='One painting wrapped 270° round the player, office hours to after hours as the inbox empties',
        weapon='Keyboard, modelled in code',
        swatches=['#7dffc9', '#b8ffe4', '#f2e2bd', '#ffd27a'],
        air_note='Screen pixels, strip-light dust and paper off every hit',
        air=[['glow', [255, 214, 140], '#fff3d6', 16, 4, 9, 0, .6], ['pixels', ['#7dffc9', '#b8ffe4', '#3fe0a8'], 90],
             ['scraps', ['#f2e2bd', '#fff8ea', '#d9cfb8'], 22]],
        gpt=[('split', ['gpt-pano.jpg', 'gpt-pano-night.jpg'], 'First 270° office, day and night'),
             ('fx', ['gpt-weapon.jpg'], 'Keyboard sheet'), ('', ['gpt-card.jpg'], 'Level card')]),
    'castle': dict(
        name='Haunted Halls', acc='#e6dcff', glow='160, 120, 255', shadow='#1e1240', tint=('160, 120, 255', '255, 160, 70'), air_bg=('#2d2050', '#0f0a22'),
        phases=['Candlelight', 'Witching hour', 'Haunted'],
        paint_note='One painting wrapped 270° round the player, candlelight to haunted as the inbox empties',
        weapon="Knight's sword, modelled in code",
        swatches=['#ffc457', '#ff8a3d', '#b79cff', '#fff1c4'],
        air_note='Candle embers, violet motes and parchment off every cut',
        air=[['glow', [183, 156, 255], '#efe8ff', 30, 5, 14, 0, .9], ['embers', ['#ffc457', '#ff8a3d', '#fff1c4'], 46],
             ['scraps', ['#efdcae', '#d9c08a', '#8a5a34'], 14]],
        gpt=[('split', ['gpt-pano.jpg', 'gpt-pano-night.jpg'], 'First 270° hall, dusk and night'),
             ('fx', ['gpt-weapon.jpg'], 'Sword sheet'), ('', ['gpt-card.jpg'], 'Level card')]),
    'lab': dict(
        name='Toxic Danger', acc='#e4ffc8', glow='150, 255, 60', shadow='#10301a', tint=('150, 255, 60', '60, 255, 170'), air_bg=('#183a26', '#08140e'),
        phases=['Lights on', 'Lockdown', 'Blackout'],
        paint_note='One painting wrapped 270° round the player, lights on to blackout as the inbox empties',
        weapon='Disinfectant sprayer, modelled in code',
        swatches=['#a6ff3d', '#5dffa1', '#e9ffd0', '#f3ff6a'],
        air_note='Green spray mist, bubbles and spores, and goo off every melt',
        air=[['mist', ['#a6ff3d', '#5dffa1', '#7dffb0', '#d8ff6a'], 60], ['bubbles', ['#c8ff9a', '#7dffc9', '#e9ffd0'], 34],
             ['glow', [166, 255, 61], '#f2ffd8', 22, 3, 8, 0, .9]]),
    'space': dict(
        name='Super Space', acc='#d4fbff', glow='60, 230, 255', shadow='#14103a', tint=('60, 230, 255', '255, 110, 220'), air_bg=('#1a1640', '#06051a'),
        phases=['Cruising', 'The jump', 'Deep space'],
        paint_note='A deck over a warping starfield, wrapped 270° round the player, cruising to deep space',
        weapon='Saber, modelled in code',
        swatches=['#ffffff', '#7df3ff', '#ff8ae6', '#cfc4ff'],
        air_note='Streaking stars, deck glints and pixel shards off every slash',
        air=[['streaks', ['#ffffff', '#7df3ff', '#ff8ae6', '#cfc4ff'], 70], ['glow', [125, 243, 255], '#ffffff', 26, 2, 6, 0, .95],
             ['pixels', ['#ff8ae6', '#7df3ff', '#ffffff'], 40]],
        gpt=[('split', ['gpt-pano.jpg', 'gpt-pano-night.jpg'], 'First 270° cockpit, light and dark', 'object-position:50% 78%'),
             ('fx', ['gpt-weapon.jpg'], 'Saber modelling sheet'), ('', ['gpt-card.jpg'], 'Level card')]),
    'inferno': dict(
        name='Inferno', acc='#ffe2b8', glow='255, 140, 40', shadow='#3a1408', tint=('255, 140, 40', '255, 60, 40'), air_bg=('#40180c', '#140604'),
        phases=['Stoked', 'Banked', 'Lights out'],
        paint_note='One painting wrapped 270° round the player, stoked to lights out as the inbox empties',
        weapon='Flame thrower, modelled in code',
        swatches=['#ffc23d', '#ff7a1e', '#ff3d2e', '#fff1c4'],
        air_note='Embers, sparks and ash, and fire across every email',
        air=[['glow', [255, 122, 30], '#fff1c4', 18, 8, 22, 0, .9], ['embers', ['#ffc23d', '#ff7a1e', '#ff3d2e', '#fff1c4'], 80],
             ['scraps', ['#3a2a24', '#5a4036', '#c9b8a8'], 22]],
        gpt=[('split', ['gpt-pano.jpg', 'gpt-pano-night.jpg'], 'First 270° incinerator, light and dark'),
             ('fx', ['gpt-weapon.jpg'], 'Flame thrower sheet'), ('', ['gpt-card.jpg'], 'Level card')]),
    'lumber': dict(
        name='LumberHack', acc='#ffe7bf', glow='255, 170, 40', shadow='#3a1c08', tint=('255, 170, 40', '220, 80, 30'), air_bg=('#3a2414', '#140a06'),
        phases=['Golden hour', 'Dusk', 'Lamplight'],
        paint_note='One painting wrapped 270° round the player, golden hour to lamplight as the inbox empties',
        weapon='Axe, modelled in code',
        swatches=['#f6a81c', '#ee7a1a', '#d9471c', '#f3c53a'],
        air_note='Maple leaves, pollen, fireflies and wood chips off every chop',
        air=[['glow', [255, 210, 120], '#fff4d6', 26, 3, 8, 0, .9], ['glow', [189, 255, 92], '#f2ffd8', 8, 5, 9, .4, .5],
             ['scraps', ['#e8c48a', '#c99a5a', '#f3dcb0'], 18], ['leaves', ['#f6a81c', '#ee7a1a', '#d9471c', '#f3c53a'], 34]],
        gpt=[('split', ['gpt-pano.jpg', 'gpt-pano-night.jpg'], 'First 270° farm, day and night'),
             ('fx', ['gpt-weapon.jpg'], 'Axe sheet'), ('', ['gpt-card.jpg'], 'Level card')]),
}
LEVELS['lab']['gpt'] = [('split', ['gpt-pano.jpg', 'gpt-pano-night.jpg'], 'First 270° lab, lights on and lockdown'),
                        ('fx', ['gpt-weapon.jpg'], 'Sprayer sheet'), ('', ['gpt-card.jpg'], 'Level card')]
LEVELS['space'].update(day='paint-day.jpg', night='paint-night.jpg')

PAGE = open(os.path.join(HERE, 'level.template.html')).read()

for id, L in LEVELS.items():
    a = f'assets/{id}'
    figures = '\n'.join(
        f'        <figure class="{kind}">' + (f'<img class="blur" src="{a}/{files[0]}">' if kind == 'fx' else '') + ''.join(f'<img src="{a}/{f}"' + (f' style="{style[0]}"' if style else '') + '>' for f in files) + f'<figcaption>{cap}</figcaption></figure>'
        for kind, files, cap, *style in L['gpt'])
    fill = {
        'TITLE': L['name'], 'NAME': L['name'].upper(), 'A': a,
        'DAY': f"{a}/{L.get('day', 'paint-day.webp')}", 'NIGHT': f"{a}/{L.get('night', 'paint-night.webp')}",
        'ACC': L['acc'], 'GLOW': L['glow'], 'SHADOW': L['shadow'], 'TINT1': L['tint'][0], 'TINT2': L['tint'][1],
        'PHASES': ''.join(f'<span class="chip">{p}</span>' for p in L['phases']),
        'PAINT_NOTE': L['paint_note'], 'WEAPON': L['weapon'], 'AIR_NOTE': L['air_note'],
        'SWATCHES': ''.join(f'<i style="background:{c}"></i>' for c in L['swatches']),
        'AIR': json.dumps({'bg': L['air_bg'], 'layers': L['air']}),
        'PLAY': L.get('play', f'{a}/headset.jpg'), 'PLAY_AT': L.get('play_at', '50% 50%'),
        'FIGURES': figures,
    }
    page = PAGE
    for k, v in fill.items():
        page = page.replace('{{' + k + '}}', v)
    assert '{{' not in page, (id, page[page.index('{{'):][:40])
    open(os.path.join(HERE, f'level-{id}.html'), 'w').write(page)
    print(f'level-{id}.html')
