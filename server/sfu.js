/**
 * SFU (Selective Forwarding Unit) - Simplified Server-Coordinated Video
 * 
 * This is NOT a true media-relaying SFU (which would require native bindings).
 * Instead, it's a COORDINATION SFU that manages signaling in a cleaner way:
 * 
 * - Each client connects to the server with a single offer
 * - Server acts as coordinator for track distribution
 * - Actual media still flows peer-to-peer (simplified mesh)
 * - Server coordinates who connects to whom
 * 
 * This gives benefits of centralized coordination without binary dependencies.
 */

const clients = {}; // socketId → {socket, roomId, playerName, offer, answer, tracks}

module.exports = function(socket, io) {
    /**
     * JOIN_GAME_SFU
     * Client connects to SFU by sending their socketId and roomId
     */
    socket.on('joinGameSFU', ({ roomId, playerName }) => {
        const socketId = socket.id;
        
        console.log(`🎥 SFU JOIN: ${playerName} (${socketId.substring(0,6)}) joining room ${roomId}`);
        
        clients[socketId] = {
            socket,
            roomId,
            playerName,
            offer: null,
            answer: null,
            tracks: {}
        };
        
        // Notify all peers in room that new player joined game
        io.to(roomId).emit('sfuPlayerJoined', {
            socketId: socketId,
            playerName: playerName,
            timestamp: Date.now()
        });
    });
    
    /**
     * SFU_OFFER
     * Client sends offer to SFU server
     * Server forwards to all other players in room
     */
    socket.on('sfuOffer', ({ roomId, offer }) => {
        const socketId = socket.id;
        console.log(`📤 SFU OFFER from ${socketId.substring(0,6)} in room ${roomId}`);
        console.log(`   ℹ️ Offer type: ${offer.type}, SDP length: ${offer.sdp?.length || 0}`);
        
        if (clients[socketId]) {
            clients[socketId].offer = offer;
        }
        
        // Get list of clients in this room
        const clientsInRoom = Object.values(clients).filter(c => c.roomId === roomId);
        console.log(`   ℹ️ Broadcasting to ${clientsInRoom.length} clients in room`);
        
        // Broadcast offer to all OTHER clients in room
        socket.to(roomId).emit('sfuOfferReceived', {
            from: socketId,
            offer: offer
        });
        console.log(`   ✅ Broadcast complete`);
    });
    
    /**
     * SFU_ANSWER
     * Client sends answer to specific peer
     * Server forwards it
     */
    socket.on('sfuAnswer', ({ to, answer }) => {
        const socketId = socket.id;
        console.log(`📥 SFU ANSWER from ${socketId.substring(0,6)} → ${to.substring(0,6)}`);
        
        // Forward answer to target peer
        io.to(to).emit('sfuAnswerReceived', {
            from: socketId,
            answer: answer
        });
    });
    
    /**
     * SFU_ICE_CANDIDATE
     * Client sends ICE candidate
     * Server forwards to target peer
     */
    socket.on('sfuIceCandidate', ({ to, candidate }) => {
        const socketId = socket.id;
        
        // Forward ICE candidate to target peer
        io.to(to).emit('sfuIceCandidateReceived', {
            from: socketId,
            candidate: candidate
        });
    });
    
    /**
     * SFU_REQUEST_OFFER
     * Client requests fresh offer from another peer
     * Used for feed recovery/renegotiation
     */
    socket.on('sfuRequestOffer', ({ from }) => {
        const socketId = socket.id;
        console.log(`🔄 SFU REQUEST OFFER from ${socketId.substring(0,6)} asking ${from.substring(0,6)}`);
        
        // Forward request to that peer to send fresh offer
        io.to(from).emit('sfuOfferRequested', {
            from: socketId
        });
    });
    
    /**
     * SFU_DISCONNECT
     * Client disconnects - notify room
     */
    socket.on('disconnect', () => {
        const socketId = socket.id;
        if (clients[socketId]) {
            const { roomId, playerName } = clients[socketId];
            console.log(`👋 SFU DISCONNECT: ${playerName} (${socketId.substring(0,6)}) from room ${roomId}`);
            
            delete clients[socketId];
            
            // Notify room that player disconnected
            io.to(roomId).emit('sfuPlayerDisconnected', {
                socketId: socketId
            });
        }
    });
};
