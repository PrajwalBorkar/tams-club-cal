import express from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { deleteClubImages, processClubUpload } from '../functions/images';
import { newId, sendError } from '../functions/util';
import { createHistory } from '../functions/edit-history';
import Club from '../models/club';
import { AccessLevel, RequestWithClubFiles } from '../functions/types';
import { isAuthenticated } from '../functions/auth';
import History from '../models/history';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * GET /clubs
 *
 * Sends the list of all clubs
 */
router.get('/', async (req: Request, res: Response) => {
    const clubs = await Club.find({});
    res.send(clubs);
});

/**
 * GET /clubs/<id>
 *
 * Gets a club by id
 */
router.get('/:id', async (req: Request, res: Response) => {
    const id = req.params.id;
    const club = await Club.findOne({ id }).exec();
    if (club) res.send(club);
    else sendError(res, 400, 'Invalid club id');
});

// Create images object for multer
const imageUpload = upload.fields([
    { name: 'cover', maxCount: 1 },
    { name: 'exec', maxCount: 20 },
]);

/**
 * POST /clubs
 *
 * Creates a new club
 */
router.post('/', imageUpload, async (req: Request, res: Response) => {
    try {
        const { coverImg, coverImgThumbnail, execImgList, club } = await processClubUpload(req as RequestWithClubFiles);

        const historyId = newId();
        const id = newId();

        const execs = club.execs.map((e, i) => ({
            name: e.name,
            position: e.position,
            description: e.description || '',
            img: execImgList[i],
        }));

        const newClub = new Club({
            id,
            name: club.name,
            advised: club.advised,
            description: club.description,
            links: club.links,
            coverImgThumbnail,
            coverImg,
            execs,
            committees: club.committees,
        });
        const newHistory = await createHistory(req, newClub.toObject(), 'clubs', id, historyId, true, club);

        const clubRes = await newClub.save();
        const historyRes = await newHistory.save();
        if (clubRes === newClub && historyRes === newHistory) res.sendStatus(204);
        else sendError(res, 500, 'Unable to add new club to database');
    } catch (error) {
        console.error(error);
        sendError(res, 500, 'Internal server error');
    }
});

/**
 * PUT /clubs/<id>
 */
router.put('/:id', imageUpload, async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        const prev = await Club.findOne({ id }).exec();
        if (!prev) {
            sendError(res, 400, 'Invalid event ID');
            return;
        }

        const { coverImg, coverImgThumbnail, execImgList, club } = await processClubUpload(req as RequestWithClubFiles);

        const execs = club.execs.map((e, i) => ({
            name: e.name,
            position: e.position,
            description: e.description || '',
            img: execImgList[i] || e.img || '',
        }));

        const historyId = newId();
        const newHistory = await createHistory(req, prev, 'clubs', id, historyId, false, club);
        const clubRes = await Club.updateOne(
            { id },
            {
                $set: {
                    name: club.name,
                    advised: club.advised,
                    description: club.description,
                    links: club.links,
                    coverImgThumbnail,
                    coverImg,
                    execs,
                    committees: club.committees,
                },
            }
        );
        const historyRes = await newHistory.save();

        if (clubRes.acknowledged && historyRes === newHistory) res.sendStatus(204);
        else sendError(res, 500, 'Unable to update event in database.');
    } catch (error) {
        console.error(error);
        sendError(res, 500, 'Internal server error');
    }
});

/**
 * DELETE /clubs/<id>
 *
 * Deletes a club by ID
 */
router.delete('/:id', async (req: Request, res: Response) => {
    // Check if user is authenticated
    if (!isAuthenticated(req, res, AccessLevel.ADMIN)) return;

    // Get club
    const club = await Club.findOne({ id: req.params.id });

    // Delete images from AWS
    await deleteClubImages(club);

    // Delete club and history
    const deleteRes = await Club.deleteOne({ id: req.params.id });
    await History.deleteMany({ resource: 'clubs', editId: req.params.id });

    // Return ok: 1 or error
    if (deleteRes.deletedCount === 1) res.sendStatus(204);
    else sendError(res, 500, 'Could not delete club');
});

export default router;
