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

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = Array.from(db.users.values()).find(u => u.id === userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { bio, interests } = req.body;

        // Update profile
        user.profile = {
            ...user.profile,
            bio: bio || user.profile.bio,
            interests: interests || user.profile.interests,
            updatedAt: new Date().toISOString()
        };

        db.users.set(user.email, user);

        res.json({
            message: 'Profile updated successfully',
            profile: {
                name: user.profile.name,
                bio: user.profile.bio,
                interests: user.profile.interests,
                eventsOrganized: user.profile.eventsOrganized,
                eventsAttended: user.profile.eventsAttended
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Error updating profile' });
    }
});


// Get user profile
router.get('/profile', authenticateToken, (req, res) => {
    try {
        const userId = req.user.id;
        const user = Array.from(db.users.values()).find(u => u.id === userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            profile: {
                name: user.profile.name,
                bio: user.profile.bio,
                interests: user.profile.interests,
                role: user.role,
                eventsOrganized: user.profile.eventsOrganized,
                eventsAttended: user.profile.eventsAttended,
                createdAt: user.profile.createdAt
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Error fetching profile' });
    }
});
 


module.exports = router;