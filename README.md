# Double Lucky 7 Online v3

Dit is een echte multiplayer-prototype met privékaarten.

## Lokaal testen
Node.js 18+ vereist.
```bash
npm start
```
Open daarna http://localhost:3000.

## Online zetten
Deze app kan op een Node.js hostingdienst worden geplaatst. De server gebruikt alleen standaard Node.js en Server-Sent Events, dus er is geen database nodig voor een eerste test.

Voor productie is een database/room-opslag en reconnect/anti-cheat verder aan te raden.

## Belangrijk
De server stuurt iedere speler alleen zijn eigen hand via de SSE-verbinding. De algemene spelstatus bevat geen verborgen kaarten van andere spelers.
