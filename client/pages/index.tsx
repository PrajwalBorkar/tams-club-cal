import React, { useState, useEffect } from 'react';
import { GetServerSidePropsContext, InferGetServerSidePropsType } from 'next';
import dayjs from 'dayjs';
import { getPublicEventList } from '../src/api';
import { darkSwitchGrey, parsePublicEventList, isSameDate, getAccessLevel } from '../src/util';
import type { SxProps, Theme } from '@mui/material';

import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import HomeBase from '../src/components/home/home-base';
import Loading from '../src/components/shared/loading';
import AddButton from '../src/components/shared/add-button';
import EventListSection from '../src/components/home/event-list-section';
import { AccessLevel } from '../src/types';

// Format the no events/add more events text on the event list
const listTextFormat = {
    marginTop: 3,
    marginBottom: 8,
    textAlign: 'center',
    color: (theme) => darkSwitchGrey(theme),
} as SxProps<Theme>;

// Server-side Rendering
export const getServerSideProps = async (ctx: GetServerSidePropsContext) => {
    const eventRes = await getPublicEventList();
    const level = await getAccessLevel(ctx);

    // Return error if bad data
    if (eventRes.status !== 200) return { props: { eventList: null, error: true, level: AccessLevel.STANDARD } };

    // Sort the events by date and filter out all elements
    // that do not start on or after the current date
    const startOfToday = dayjs().startOf('day').valueOf();
    const filteredList = eventRes.data.sort((a, b) => a.start - b.start).filter((e) => e.start >= startOfToday);
    const parsedEventList = parsePublicEventList(filteredList);
    return {
        props: { eventList: parsedEventList, error: false, level },
    };
};

const Home = ({ eventList, error, level }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
    const [eventComponentList, setEventComponentList] = useState<JSX.Element | JSX.Element[]>(
        <Loading sx={{ marginBottom: 4 }} />
    );

    // This hook will first make sure the event list is not empty/null,
    // then it will call a util function to split up multi-day events,
    // group the events by date, and create a list of EventListSections,
    // each containing a list of events for that day.
    useEffect(() => {
        // Make sure event list is not null
        if (eventList === null) return;

        // Set text to the end of the events list if empty
        if (eventList.length === 0) {
            setEventComponentList(
                <Typography variant="h6" component="h2" sx={listTextFormat}>
                    No events planned... Click the + to add one!
                </Typography>
            );
            return;
        }

        // Split the events into groups by date
        // TODO: Put this in a util function or not idk
        const eventGroupList = [];
        let tempList = [];
        eventList.forEach((event, index) => {
            if (tempList.length > 0 && isSameDate(tempList[tempList.length - 1].start, event.start)) {
                tempList.push(event);
            } else {
                if (index !== 0) eventGroupList.push(tempList);
                tempList = [event];
            }
        });
        eventGroupList.push(tempList);

        // Map each group item to an EventListSection object
        const groupedComponents = eventGroupList.map((group, index) => (
            <EventListSection eventList={group} key={index} />
        ));

        // No more message at the bottom!
        groupedComponents.push(
            <Typography key="nomore" sx={listTextFormat}>
                No more events... Click the + to add one!
            </Typography>
        );

        // Display list
        setEventComponentList(groupedComponents);
    }, [eventList]);

    // Show error message if errored
    if (error) {
        return (
            <HomeBase title={`Events`}>
                <Loading error sx={{ marginBottom: 4 }}>
                    Could not get activity list. Please reload the page or contact the site manager to fix this issue.
                </Loading>
            </HomeBase>
        );
    }

    return (
        <HomeBase>
            <Container
                maxWidth="lg"
                sx={{
                    height: 'max-content',
                    overflowX: 'hidden',
                }}
            >
                <AddButton color="primary" label="Event" path="/edit/events" disabled={level < AccessLevel.STANDARD} />
                {eventComponentList}
            </Container>
        </HomeBase>
    );
};

export default Home;
