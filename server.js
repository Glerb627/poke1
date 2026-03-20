// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Suits and Values for deck generation
const suits = ['♠', '♥', '♦', '♣'];
const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

let rooms = {};

// Helper: Create a deck
function createDeck() {
    let deck = [];
    for(let suit of suits) {
        for(let value of values) {
            deck.push({ suit, value, color: (suit === '♥' || suit === '♦') ? 'text-red-500' : 'text-black' });
        }
    }
    return deck.sort(() => Math.random() - 0.5);
}

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Join/Create Room
    socket.on('join_room', ({ roomId, username, isSinglePlayer }) => {
        socket.join(roomId);
        
        if (!rooms[roomId]) {
            rooms[roomId] = {
                id: roomId,
                players: [],
                deck: createDeck(),
                board: [],
                pot: 0,
                gameState: 'waiting', // waiting, dealing, flop, turn, river
                messages: []
            };
        }

        const room = rooms[roomId];
        room.players.push({ id: socket.id, username, chips: 1000, hand: [], status: 'waiting' });

        // Add a bot for singleplayer
        if(isSinglePlayer && room.players.length === 1) {
            room.players.push({ id: 'bot-1', username: 'Dealer Bot', chips: 1000, hand: [], status: 'waiting' });
        }

        io.to(roomId).emit('update_game', room);
        io.to(roomId).emit('chat_message', { user: 'System', text: `${username} joined the room.` });
    });

    // Start Game
    socket.on('start_game', (roomId) => {
        const room = rooms[roomId];
        if(!room) return;

        room.gameState = 'playing';
        room.deck = createDeck();
        room.board = [];
        room.pot = 0;

        // Deal 2 cards to each player
        room.players.forEach(p => {
            p.hand = [room.deck.pop(), room.deck.pop()];
            p.status = 'playing';
        });

        io.to(roomId).emit('update_game', room);
        io.to(roomId).emit('chat_message', { user: 'System', text: `Game started!` });
    });

    // Handle Deal Community Cards (Flop, Turn, River logic mapped to one button for simplicity in demo)
    socket.on('progress_game', (roomId) => {
        const room = rooms[roomId];
        if(!room) return;

        if (room.board.length === 0) { // Flop
            room.board = [room.deck.pop(), room.deck.pop(), room.deck.pop()];
        } else if (room.board.length === 3 || room.board.length === 4) { // Turn/River
            room.board.push(room.deck.pop());
        } else {
            // End of round, reset
            room.gameState = 'waiting';
            room.board = [];
            room.players.forEach(p => p.hand = []);
        }
        io.to(roomId).emit('update_game', room);
    });

    // Handle Chat
    socket.on('send_message', ({ roomId, message, username }) => {
        io.to(roomId).emit('chat_message', { user: username, text: message });
    });

    socket.on('disconnect', () => {
        // Cleanup logic here
        console.log(`User disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
