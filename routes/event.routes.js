const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const db = require('../db/inMemoryDb');
const { sendEmail, sendBulkEmails } = require('../utils/email');

// Create event
router.post('/', authenticateToken, (req, res) => {
    try {
        const { title, description, date, time, capacity } = req.body;
        const eventId = Date.now().toString();

        const event = {
            id: eventId,
            title,
            description,
            date,
            time,
            capacity,
            createdBy: req.user.id,
            participants: new Set()
        };

        db.events.set(eventId, event);
        res.status(201).json({ message: 'Event created successfully', eventId });
    } catch (error) {
        res.status(500).json({ error: 'Error creating event' });
    }
});

// Update event
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const eventId = req.params.id;
        const event = db.events.get(eventId);
        const userId = req.user.id;

        // Check if event exists
        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        // Check if user is the event creator
        if (event.createdBy !== userId) {
            return res.status(403).json({ 
                error: 'Unauthorized: Only the event creator can update this event' 
            });
        }

        const { title, description, date, time, capacity } = req.body;

        // Validate new capacity
        if (capacity && capacity < event.participants.size) {
            return res.status(400).json({ 
                error: 'New capacity cannot be less than current number of participants',
                currentParticipants: event.participants.size
            });
        }

        // Update event with new values while preserving existing participants
        const updatedEvent = {
            ...event,
            title: title || event.title,
            description: description || event.description,
            date: date || event.date,
            time: time || event.time,
            capacity: capacity || event.capacity,
            updatedAt: new Date().toISOString()
        };

        db.events.set(eventId, updatedEvent);

        // If date/time changed, notify participants
        if (date !== event.date || time !== event.time) {
            const participants = Array.from(event.participants);
            const notifications = await Promise.all(
                participants.map(async (participantId) => {
                    const participant = Array.from(db.users.values())
                        .find(user => user.id === participantId);
                    
                    if (participant) {
                        return {
                            email: participant.email,
                            subject: 'Event Update Notification',
                            text: `The event "${updatedEvent.title}" has been updated.\n
                                  New date: ${updatedEvent.date}\n
                                  New time: ${updatedEvent.time}`
                        };
                    }
                }).filter(Boolean)
            );

            // Send notifications in parallel
            if (notifications.length > 0) {
                await sendBulkEmails(notifications);
            }
        }

        // Update event in database
        db.events.set(eventId, updatedEvent);

        res.json({
            message: 'Event updated successfully',
            event: {
                id: updatedEvent.id,
                title: updatedEvent.title,
                description: updatedEvent.description,
                date: updatedEvent.date,
                time: updatedEvent.time,
                capacity: updatedEvent.capacity,
                participantCount: updatedEvent.participants.size,
                updatedAt: updatedEvent.updatedAt
            }
        });

    } catch (error) {
        console.error('Error updating event:', error);
        res.status(500).json({ 
            error: 'Error updating event',
            details: error.message 
        });
    }
});

// Delete event
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const eventId = req.params.id;
        const event = db.events.get(eventId);
        const userId = req.user.id;

        // Check if event exists
        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        // Check if user is the event creator
        if (event.createdBy !== userId) {
            return res.status(403).json({ 
                error: 'Unauthorized: Only the event creator can delete this event' 
            });
        }

        // Get list of participants before deleting
        const participants = Array.from(event.participants);

        // Prepare cancellation notifications
        const notifications = await Promise.all(
            participants.map(async (participantId) => {
                const participant = Array.from(db.users.values())
                    .find(user => user.id === participantId);
                
                if (participant) {
                    return {
                        email: participant.email,
                        subject: 'Event Cancellation Notice',
                        text: `The event "${event.title}" scheduled for ${event.date} at ${event.time} has been cancelled.`
                    };
                }
            }).filter(Boolean)
        );

        // Delete event and clean up registrations
        await Promise.all([
            // Remove event from all participants' registered events
            ...participants.map(participantId => {
                const userEventSet = db.userEvents.get(participantId);
                if (userEventSet) {
                    return Promise.resolve(userEventSet.delete(eventId));
                }
                return Promise.resolve();
            }),
            // Send cancellation notifications
            notifications.length > 0 ? sendBulkEmails(notifications) : Promise.resolve()
        ]);

        // Delete event
        db.events.delete(eventId);

        res.json({
            message: 'Event deleted successfully',
            eventDetails: {
                id: eventId,
                title: event.title,
                participantsNotified: participants.length
            }
        });

    } catch (error) {
        console.error('Error deleting event:', error);
        res.status(500).json({ error: 'Error deleting event' });
    }
});

// Register for event
router.post('/:id/register', authenticateToken, async (req, res) => {
    try {
        const eventId = req.params.id;
        const event = db.events.get(eventId);
        const userId = req.user.id;

        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        if (event.participants.size >= event.capacity) {
            return res.status(400).json({ error: 'Event is full' });
        }

        if (event.participants.has(userId)) {
            return res.status(400).json({ error: 'Already registered for this event' });
        }


        // Add user to event participants
        event.participants.add(userId);

        // Initialize user's events set if it doesn't exist
        if (!db.userEvents.has(userId)) {
            db.userEvents.set(userId, new Set());
        }

        // Add event to user's registered events
        db.userEvents.get(userId).add(eventId);

        // Send confirmation email
        const user = Array.from(db.users.values())
            .find(u => u.id === userId);

        if (user) {
            await sendEmail(
                user.email,
                'Event Registration Confirmation',
                `You have successfully registered for "${event.title}"\n
                 Date: ${event.date}\n
                 Time: ${event.time}\n
                 Location: Online`
            );
        }

        res.json({ 
            message: 'Successfully registered for event',
            eventId: eventId,
            event: {
                title: event.title,
                date: event.date,
                time: event.time,
                spotsRemaining: event.capacity - event.participants.size
            }
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            error: 'Error registering for event',
            details: error.message 
        });
    }
});

// Get all events
router.get('/', authenticateToken, (req, res) => {
    try {
        // Convert Map values to array
        const eventList = Array.from(db.events.values()).map(event => {
            // Get creator's name
            const creator = Array.from(db.users.values())
                .find(user => user.id === event.createdBy);

            // Check if current user is registered
            const isUserRegistered = event.participants.has(req.user.id);
            
            // Calculate remaining spots
            const spotsRemaining = event.capacity - event.participants.size;

            return {
                id: event.id,
                title: event.title,
                description: event.description,
                date: event.date,
                time: event.time,
                capacity: event.capacity,
                participantCount: event.participants.size,
                spotsRemaining,
                isUserRegistered,
                createdBy: {
                    id: creator?.id,
                    name: creator?.name
                },
                isFull: event.participants.size >= event.capacity,
                registrationStatus: isUserRegistered ? 'registered' : 
                                  (event.participants.size >= event.capacity ? 'full' : 'open')
            };
        });

        // Sort events by date
        eventList.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Add optional filtering
        const { date, query } = req.query;
        let filteredEvents = eventList;

        // Filter by date if provided
        if (date) {
            filteredEvents = filteredEvents.filter(event => event.date === date);
        }

        // Filter by search query if provided
        if (query) {
            const searchQuery = query.toLowerCase();
            filteredEvents = filteredEvents.filter(event => 
                event.title.toLowerCase().includes(searchQuery) || 
                event.description.toLowerCase().includes(searchQuery)
            );
        }

        res.json({
            total: filteredEvents.length,
            events: filteredEvents,
            filters: {
                date,
                query
            }
        });

    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({ error: 'Error fetching events' });
    }
});

module.exports = router;