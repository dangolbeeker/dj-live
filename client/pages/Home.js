import React from 'react';
import axios from 'axios';
import {Link} from 'react-router-dom';
import {headTitle, pagination} from '../../mainroom.config';
import {Button, Col, Container, Row, Spinner} from 'reactstrap';
import {shortenNumber} from '../utils/numberUtils';
import {displayErrorMessage, displayGenreAndCategory, getAlert, LoadingSpinner} from '../utils/displayUtils';
import {timeSince} from '../utils/dateUtils';
import ViewersIcon from '../icons/eye.svg';

const STARTING_PAGE = 1;

export default class Home extends React.Component {

    constructor(props) {
        super(props);

        this.state = {
            loaded: false,
            loggedInUser: '',
            featuredLiveStreams: [],
            subscriptionLiveStreams: [],
            recordedStreams: [],
            featuredLiveStreamsPage: STARTING_PAGE,
            subscriptionsLiveStreamsPage: STARTING_PAGE,
            recordedStreamsNextPage: STARTING_PAGE,
            showLoadMoreFeaturedButton: false,
            showLoadMoreFeaturedSpinner: false,
            showLoadMoreSubscriptionsButton: false,
            showLoadMoreSubscriptionsSpinner: false,
            showLoadMorePastStreamsButton: false,
            showLoadMorePastStreamsSpinner: false,
            alertText: '',
            alertColor: ''
        }
    }

    componentDidMount() {
        document.title = headTitle;
        this.fillComponent();
    }

    async fillComponent() {
        await this.getLoggedInUser();
        const promises = [
            this.getFeaturedLiveStreams(),
            this.getPastStreams()
        ];
        if (this.state.loggedInUser) {
            promises.push(this.getSubscriptionLiveStreams());
        }
        await Promise.all(promises);
        this.setState({
            loaded: true
        });
    }

    async getLoggedInUser() {
        const res = await axios.get('/api/logged-in-user');
        this.setState({
            loggedInUser: res.data.username
        });
    }

    async getFeaturedLiveStreams() {
        const params = {
            page: this.state.featuredLiveStreamsPage,
            limit: pagination[this.state.loggedInUser ? 'small' : 'large']
        };

        const eventStagesCount = await this.getEventStagesReturningCount(params);
        params.limit = params.limit + (params.limit - eventStagesCount);

        const res = await axios.get('/api/livestreams', {params});

        const featuredLiveStreams = [...this.state.featuredLiveStreams, ...(res.data.streams || [])];
        if (res.data.streams && res.data.streams.length) {
            featuredLiveStreams.sort((a, b) => b.viewCount - a.viewCount);
        }

        this.setState({
            featuredLiveStreams,
            featuredLiveStreamsPage: this.state.featuredLiveStreamsPage || res.data.nextPage,
            showLoadMoreSubscriptionsButton: !!(this.state.showLoadMoreSubscriptionsButton || res.data.nextPage)
        });
    }

    async getEventStagesReturningCount(params) {
        const eventStagesRes = await axios.get(`/api/livestreams/event-stages`, {params});
        this.setState({
            featuredLiveStreams: [...this.state.featuredLiveStreams, ...(eventStagesRes.data.streams || [])],
            featuredLiveStreamsPage: eventStagesRes.data.nextPage,
            showLoadMoreSubscriptionsButton: !!eventStagesRes.data.nextPage
        });
        return eventStagesRes.data.streams ? eventStagesRes.data.streams.length : 0;
    }

    async getSubscriptionLiveStreams() {
        const params = {
            page: this.state.subscriptionsLiveStreamsPage,
            limit: pagination[this.state.loggedInUser ? 'small' : 'large']
        };

        const subbedEventStagesCount = await this.getSubscribedEventStagesReturningCount(params);

        const subsRes = await axios.get(`/api/users/${this.state.loggedInUser}/subscriptions`);
        if (subsRes.data.subscriptions && subsRes.data.subscriptions.length) {
            const streamsRes = await axios.get(`/api/livestreams/`, {
                params: {
                    usernames: subsRes.data.subscriptions,
                    page: params.page,
                    limit: params.limit + (params.limit - subbedEventStagesCount)
                }
            });

            const subscriptionLiveStreams = [...this.state.subscriptionLiveStreams, ...(streamsRes.data.streams || [])];
            if (streamsRes.data.streams && streamsRes.data.streams.length) {
                subscriptionLiveStreams.sort((a, b) => b.viewCount - a.viewCount);
            }

            this.setState({
                subscriptionLiveStreams,
                subscriptionLiveStreamsPage: this.state.subscriptionLiveStreamsPage || streamsRes.data.nextPage,
                showLoadMoreSubscriptionsButton: !!(this.state.showLoadMoreSubscriptionsButton || streamsRes.data.nextPage)
            });
        }
    }

    async getSubscribedEventStagesReturningCount(params) {
        const subbedEventsRes = await axios.get(`/api/users/${this.state.loggedInUser}/subscribed-events`);
        if (subbedEventsRes.data.subscribedEventIds && subbedEventsRes.data.subscribedEventIds.length) {
            const eventStagesRes = await axios.get(`/api/livestreams/event-stages`, {
                params: {
                    eventIds: subbedEventsRes.data.subscribedEventIds,
                    page: params.page,
                    limit: params.limit
                }
            });
            this.setState({
                subscriptionLiveStreams: [...this.state.subscriptionLiveStreams, ...(eventStagesRes.data.streams || [])],
                subscriptionLiveStreamsPage: eventStagesRes.data.nextPage,
                showLoadMoreSubscriptionsButton: !!eventStagesRes.data.nextPage
            });
            return eventStagesRes.data.streams ? eventStagesRes.data.streams.length : 0;
        }
        return 0;
    }

    async getPastStreams() {
        const res = await axios.get('/api/recorded-streams', {
            params: {
                page: this.state.recordedStreamsNextPage,
                limit: pagination[this.state.loggedInUser ? 'small' : 'large']
            }
        });

        this.setState({
            recordedStreams: [...this.state.recordedStreams, ...(res.data.recordedStreams || [])],
            recordedStreamsNextPage: res.data.nextPage,
            showLoadMorePastStreamsButton: !!res.data.nextPage
        });
    }

    renderFeaturedLiveStreams() {
        const loadMoreButton = this.renderLoadMoreButton('showLoadMoreFeaturedSpinner', async () => {
            await this.getFeaturedLiveStreams();
        });

        return this.state.featuredLiveStreams.length > 0 && (
            <React.Fragment>
                {this.renderLiveStreams('Featured', this.state.featuredLiveStreams)}
                {this.state.showLoadMoreFeaturedButton && loadMoreButton}
            </React.Fragment>
        );
    }

    renderSubscriptionLiveStreams() {
        const loadMoreButton = this.renderLoadMoreButton('showLoadMoreSubscriptionsSpinner', async () => {
            await this.getSubscriptionLiveStreams();
        });

        return this.state.subscriptionLiveStreams.length > 0 && (
            <React.Fragment>
                {this.renderLiveStreams('Subscriptions', this.state.subscriptionLiveStreams)}
                {this.state.showLoadMoreSubscriptionsButton && loadMoreButton}
                <hr className='my-4'/>
            </React.Fragment>
        );
    }

    renderLoadMoreButton(spinnerStateKey, loadMoreOnClick) {
        const onClick = () => {
            this.setState({[spinnerStateKey]: true}, async () => {
                try {
                    await loadMoreOnClick();
                } catch (err) {
                    displayErrorMessage(this, `An error occurred when loading more streams. Please try again later. (${err})`);
                }
                this.setState({[spinnerStateKey]: false});
            });
        };
        return (
            <div className='text-center'>
                <Button className='btn-dark' onClick={onClick}>
                    {this.state[spinnerStateKey] ? <Spinner size='sm' /> : 'Load More'}
                </Button>
            </div>
        );
    }

    renderLiveStreams(title, liveStreams) {
        const streamBoxes = liveStreams.map((liveStream, index) => (
            <Col className='stream margin-bottom-thick' key={index}>
                <span className='live-label'>LIVE</span>
                <span className='view-count'>
                    <img src={ViewersIcon} width={18} height={18} className='mr-1 my-1' alt='Viewers icon'/>
                    {shortenNumber(liveStream.viewCount)}
                </span>
                <Link to={liveStream.eventStageId ?`/stage/${liveStream.eventStageId}` : `/user/${liveStream.username}/live`}>
                    <img className='w-100' src={liveStream.thumbnailURL}
                         alt={`${liveStream.eventStageId ? `${liveStream.stageName} Stage` : `${liveStream.username} Stream`} Thumbnail`}/>
                </Link>
                <table>
                    <tbody>
                        <tr>
                            {!liveStream.eventStageId && (
                                <td valign='top'>
                                    <Link to={`/user/${liveStream.username}`}>
                                        <img className='rounded-circle m-2' src={liveStream.profilePicURL}
                                             width='50' height='50'
                                             alt={`${liveStream.username} profile picture`}/>
                                    </Link>
                                </td>
                            )}
                            <td valign='middle' className='w-100'>
                                <h5>
                                    <Link to={liveStream.eventStageId ? `/stage/${liveStream.eventStageId}` : `/user/${liveStream.username}`}>
                                        {liveStream.eventStageId ? liveStream.stageName : (liveStream.displayName || liveStream.username)}
                                    </Link>
                                    <span className='black-link'>
                                        <Link to={liveStream.eventStageId ? `/stage/${liveStream.eventStageId}` : `/user/${liveStream.username}/live`}>
                                            {liveStream.title ? ` - ${liveStream.title}` : ''}
                                        </Link>
                                    </span>
                                </h5>
                                <h6>
                                    {displayGenreAndCategory({
                                        genre: liveStream.genre,
                                        category: liveStream.category
                                    })}
                                </h6>
                                <h6>
                                    Started {timeSince(liveStream.startTime)}
                                    {liveStream.eventStageId && ' as part of '}
                                    {liveStream.eventStageId && (
                                        <Link to={`/event/${liveStream.event._id}`}>
                                            {liveStream.event.eventName}
                                        </Link>
                                    )}
                                </h6>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </Col>
        ));

        return streamBoxes.length > 0 && (
            <React.Fragment>
                <Row>
                    <Col>
                        <h4>{title}</h4>
                    </Col>
                </Row>
                <Row className='mt-3' xs='1' sm='1' md='2' lg='3' xl='3'>
                    {streamBoxes}
                </Row>
            </React.Fragment>
        );
    }

    renderLiveStreamBoxes() {
        const subscriptionLiveStreams = this.renderSubscriptionLiveStreams();
        const featuredLiveStreams = this.renderFeaturedLiveStreams();

        return subscriptionLiveStreams || featuredLiveStreams ? (
            <div>
                {subscriptionLiveStreams}
                {featuredLiveStreams}
            </div>
        ) : (
            <div className='my-5 text-center'>
                <p>No one is live right now :(</p>
                {this.state.loggedInUser
                    ? <p>Be the first to <Link to={'/go-live'}>go live</Link>!</p>
                    : <p><a href={'/login'}>Log in</a> or <a href={'/register'}>register</a> and be the first to go live!</p>}
            </div>
        );
    }

    renderPastStreams() {
        const pastStreams = this.state.recordedStreams.map((recordedStream, index) => (
            <Col className='stream margin-bottom-thick' key={index}>
                <span className='video-duration'>{recordedStream.videoDuration}</span>
                <span className='view-count'>
                    <img src={ViewersIcon} width={18} height={18} className='mr-1 my-1' alt='Views icon'/>
                    {shortenNumber(recordedStream.viewCount)}
                </span>
                <Link to={`/stream/${recordedStream._id}`}>
                    <img className='w-100' src={recordedStream.thumbnailURL}
                         alt={`${recordedStream.title} Stream Thumbnail`}/>
                </Link>
                <table>
                    <tbody>
                    <tr>
                        <td valign='top'>
                            <Link to={`/user/${recordedStream.user.username}`}>
                                <img className='rounded-circle m-2' src={recordedStream.user.profilePicURL}
                                     width='50' height='50'
                                     alt={`${recordedStream.user.username} profile picture`}/>
                            </Link>
                        </td>
                        <td valign='middle'>
                            <h5 className='text-break'>
                                <Link to={`/user/${recordedStream.user.username}`}>
                                    {recordedStream.user.displayName || recordedStream.user.username}
                                </Link>
                                <span className='black-link'>
                                        <Link to={`/stream/${recordedStream._id}`}>
                                            {recordedStream.title ? ` - ${recordedStream.title}` : ''}
                                        </Link>
                                    </span>
                            </h5>
                            <h6>
                                {displayGenreAndCategory({
                                    genre: recordedStream.genre,
                                    category: recordedStream.category
                                })}
                            </h6>
                            <h6>{timeSince(recordedStream.timestamp)}</h6>
                        </td>
                    </tr>
                    </tbody>
                </table>
            </Col>
        ));

        const loadMoreButton = this.renderLoadMoreButton('showLoadMorePastStreamsSpinner', async () => {
            await this.getPastStreams();
        });

        return pastStreams.length > 0 && (
            <React.Fragment>
                <hr className='mb-4'/>
                <Row>
                    <Col>
                        <h4>Past Streams</h4>
                    </Col>
                </Row>
                <Row className='mt-3' xs='1' sm='1' md='2' lg='3' xl='3'>
                    {pastStreams}
                </Row>
                {this.state.showLoadMorePastStreamsButton && loadMoreButton}
            </React.Fragment>
        );
    }

    render() {
        return !this.state.loaded ? <LoadingSpinner /> : (
            <Container fluid='lg' className={this.state.alertText ? 'my-4' : 'my-5'}>
                {getAlert(this)}

                {this.renderLiveStreamBoxes()}
                {this.renderPastStreams()}
            </Container>
        );
    }
}
