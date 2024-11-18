const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const db = require('../db/inMemoryDb');
const { logEvent, inMemoryLogs } = require('../config/logger');
const { sendEmail, sendBulkEmails } = require('../utils/email');

// Create event
router.post('/', authenticateToken, (req, res) => {
    try {
        // Get user ID from authenticated request
        const userId = req.user?.id; // Add safe access with optional chaining

        // Validate user ID
        if (!userId) {
            logEvent('error', 'User ID not found in request', {
                action: 'CREATE_EVENT_ERROR',
                error: 'User not authenticated properly'
            });
            return res.status(401).json({ error: 'User not authenticated properly' });
        }

        const { title, description, date, time, capacity } = req.body;

        // Validate required fields
        if (!title || !date || !time || !capacity) {
            logEvent('warn', 'Missing required fields in event creation', {
                userId: userId,
                action: 'CREATE_EVENT_VALIDATION_ERROR'
            });
            return res.status(400).json({ 
                error: 'Missing required fields',
                required: ['title', 'date', 'time', 'capacity']
            });
        }

        const eventId = Date.now().toString();

        const event = {
            id: eventId,
            title,
            description: description || '',
            date,
            time,
            capacity: parseInt(capacity),
            createdBy: userId,
            participants: new Set(),
            createdAt: new Date().toISOString()
        };

        // Store event in database
        db.events.set(eventId, event);

        // Log successful creation
        logEvent('info', 'Event created successfully', {
            userId: userId,  // Explicitly pass userId
            eventId: eventId,
            action: 'CREATE_EVENT',
            metadata: {
                title,
                date,
                time
            }
        });

        res.status(201).json({ 
            message: 'Event created successfully', 
            event: {
                id: eventId,
                title: event.title,
                description: event.description,
                date: event.date,
                time: event.time,
                capacity: event.capacity,
                createdAt: event.createdAt
            }
        });

    } catch (error) {
        console.error('Create event error:', error);
        
        // Log error with user ID if available
        logEvent('error', 'Failed to create event', {
            userId: req.user?.id || 'unknown',
            error: error.message,
            action: 'CREATE_EVENT_ERROR'
        });

        res.status(500).json({ 
            error: 'Error creating event',
            message: error.message 
        });
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
            logEvent('warn', 'Update attempted on non-existent event', {
                userId,
                eventId,
                action: 'UPDATE_EVENT_NOT_FOUND'
            });
            return res.status(404).json({ error: 'Event not found' });
        }

        // Check if user is the event creator
        if (event.createdBy !== userId) {
            logEvent('warn', 'Unauthorized event update attempt', {
                userId,
                eventId,
                action: 'UPDATE_EVENT_UNAUTHORIZED'
            });
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

        // Track what was updated for logging
        const updates = {
            title: title !== event.title ? title : undefined,
            description: description !== event.description ? description : undefined,
            date: date !== event.date ? date : undefined,
            time: time !== event.time ? time : undefined,
            capacity: capacity !== event.capacity ? capacity : undefined
        };

        // Filter out undefined values
        const changedFields = Object.entries(updates)
            .filter(([_, value]) => value !== undefined)
            .map(([key]) => key);

        try {
            // If date/time changed, attempt to notify participants
            if (date !== event.date || time !== event.time) {
                const participants = Array.from(event.participants);
                const notifications = await Promise.all(
                    participants.map(async (participantId) => {
                        const participant = Array.from(db.users.values())
                            .find(user => user.id === participantId);
                        
                        if (participant) {
                            try {
                                await sendEmail(
                                    participant.email,
                                    'Event Update Notification',
                                    `The event "${updatedEvent.title}" has been updated.\n
                                    New date: ${updatedEvent.date}\n
                                    New time: ${updatedEvent.time}`
                                );
                            } catch (emailError) {
                                // Log email failure but continue with update
                                logEvent('warn', 'Failed to send update notification email', {
                                    userId,
                                    eventId,
                                    participantId,
                                    action: 'UPDATE_EVENT_EMAIL_FAILED',
                                    error: emailError.message
                                });
                            }
                        }
                    })
                );
            }
        } catch (notificationError) {
            // Log notification failure but continue with update
            logEvent('warn', 'Failed to process notifications', {
                userId,
                eventId,
                action: 'UPDATE_EVENT_NOTIFICATIONS_FAILED',
                error: notificationError.message
            });
        }

        // Update event in database
        db.events.set(eventId, updatedEvent);

        // Log successful update
        logEvent('info', 'Event updated successfully', {
            userId,
            eventId,
            action: 'UPDATE_EVENT',
            metadata: {
                changedFields,
                updatedAt: updatedEvent.updatedAt
            }
        });

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
            },
            updatedFields: changedFields
        });

    } catch (error) {
        console.error('Error updating event:', error);
        logEvent('error', 'Failed to update event', {
            userId: req.user.id,
            eventId: req.params.id,
            error: error.message,
            action: 'UPDATE_EVENT_ERROR'
        });
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

// Get event logs
router.get('/logs', authenticateToken, (req, res) => {
    try {
        const userId = req.user.id;
        
        // Validate if user exists
        if (!userId) {
            logEvent('warn', 'Log request without valid user ID', {
                action: 'FETCH_LOGS_ERROR'
            });
            return res.status(401).json({ error: 'User not authenticated' });
        }

        // Get logs from memory
        const userLogs = inMemoryLogs.get(userId) || [];
        
        // Get query parameters for filtering
        const { startDate, endDate, action, level } = req.query;
        
        let filteredLogs = [...userLogs]; // Create a copy of logs array

        // Apply filters
        if (startDate) {
            const start = new Date(startDate);
            if (isNaN(start.getTime())) {
                return res.status(400).json({ error: 'Invalid start date format' });
            }
            filteredLogs = filteredLogs.filter(log => 
                new Date(log.timestamp) >= start
            );
        }

        if (endDate) {
            const end = new Date(endDate);
            if (isNaN(end.getTime())) {
                return res.status(400).json({ error: 'Invalid end date format' });
            }
            filteredLogs = filteredLogs.filter(log => 
                new Date(log.timestamp) <= end
            );
        }

        if (action) {
            filteredLogs = filteredLogs.filter(log => 
                log.action && log.action.toLowerCase() === action.toLowerCase()
            );
        }

        if (level) {
            filteredLogs = filteredLogs.filter(log => 
                log.level && log.level.toLowerCase() === level.toLowerCase()
            );
        }

        // Sort logs by timestamp in descending order (newest first)
        filteredLogs.sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );

        logEvent('info', 'Logs retrieved successfully', {
            userId,
            action: 'FETCH_LOGS',
            metadata: {
                totalLogs: userLogs.length,
                filteredLogs: filteredLogs.length,
                filters: { startDate, endDate, action, level }
            }
        });

        res.json({
            total: filteredLogs.length,
            filters: {
                startDate: startDate || null,
                endDate: endDate || null,
                action: action || null,
                level: level || null
            },
            logs: filteredLogs.map(log => ({
                ...log,
                timestamp: new Date(log.timestamp).toISOString()
            }))
        });

    } catch (error) {
        console.error('Error fetching logs:', error);
        logEvent('error', 'Failed to fetch logs', {
            userId: req.user?.id,
            error: error.message,
            action: 'FETCH_LOGS_ERROR'
        });
        res.status(500).json({ 
            error: 'Error fetching logs',
            details: error.message 
        });
    }
});

// Just to verify the auth middleware is working
router.get('/test-auth', authenticateToken, (req, res) => {
    res.json({
        message: 'Auth working',
        user: req.user
    });
});

module.exports = router;