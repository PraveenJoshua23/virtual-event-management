const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const db = require('../db/inMemoryDb');

router.get('/events', authenticateToken, (req, res) => {
    try {
        const userEventIds = db.userEvents.get(req.user.id);
        const registeredEvents = Array.from(userEventIds).map(eventId => {
            const event = db.events.get(eventId);
            return {
                id: event.id,
                title: event.title,
                description: event.description,
                date: event.date,
                time: event.time
            };
        });



        res.json(registeredEvents);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching user events' });
    }
});

module.exports = router;