import React from 'react';
import axios from 'axios';
import {pagination, filters, siteName} from '../../mainroom.config';
import {Link} from 'react-router-dom';
import {Button, Col, Container, Dropdown, DropdownItem, DropdownMenu, DropdownToggle, Row, Spinner} from 'reactstrap';
import {shortenNumber} from '../utils/numberUtils';
import {formatDateRange, isTimeBetween, timeSince} from '../utils/dateUtils';
import {displayErrorMessage, displayGenreAndCategory, getAlert, LoadingSpinner} from '../utils/displayUtils';
import ViewersIcon from '../icons/eye.svg';
import moment from 'moment';

const STARTING_PAGE = 1;

export default class LiveStreams extends React.Component {

    constructor(props) {
        super(props);

        this.genreDropdownToggle = this.genreDropdownToggle.bind(this);
        this.setGenreFilter = this.setGenreFilter.bind(this);
        this.clearGenreFilter = this.clearGenreFilter.bind(this);
        this.categoryDropdownToggle = this.categoryDropdownToggle.bind(this);
        this.setCategoryFilter = this.setCategoryFilter.bind(this);
        this.clearCategoryFilter = this.clearCategoryFilter.bind(this);
        this.getLiveStreams = this.getLiveStreams.bind(this);
        this.getPastStreams = this.getPastStreams.bind(this);
        this.getUsers = this.getUsers.bind(this);
        this.getEvents = this.getEvents.bind(this);

        this.state = {
            loaded: false,
            liveStreams: [],
            livestreamsNextPage: STARTING_PAGE,
            showLoadMoreLivestreamsButton: false,
            recordedStreams: [],
            recordedStreamsNextPage: STARTING_PAGE,
            showLoadMorePastStreamsButton: false,
            users: [],
            usersNextPage: STARTING_PAGE,
            showLoadMoreUsersButton: false,
            events: [],
            eventsNextPage: STARTING_PAGE,
            showLoadMoreEventsButton: false,
            showLoadMoreEventsSpinner: false,
            genreDropdownOpen: false,
            genreFilter: '',
            categoryDropdownOpen: false,
            categoryFilter: '',
            showLoadMoreLivestreamsSpinner: false,
            showLoadMorePastStreamsSpinner: false,
            showLoadMoreUsersSpinner: false,
            alertText: '',
            alertColor: ''
        }
    }

    componentDidMount() {
        this.fillComponent();
    }

    async fillComponent() {
        await Promise.all([
            this.getStreams(),
            this.getEvents(),
            this.getUsers()
        ]);
        this.setState({
            loaded: true
        });
    }

    componentDidUpdate(prevProps, prevState) {
        document.title = `${decodeURIComponent(this.props.match.params.query)} - ${siteName}`;
        if (prevProps.match.params.query !== this.props.match.params.query) {
            this.setState({
                loaded: false,
                liveStreams: [],
                livestreamsNextPage: STARTING_PAGE,
                recordedStreams: [],
                recordedStreamsNextPage: STARTING_PAGE,
                users: [],
                usersNextPage: STARTING_PAGE,
                events: [],
                eventsNextPage: STARTING_PAGE,
                genreFilter: '',
                categoryFilter: ''
            }, () => {
                this.fillComponent();
            });
        } else if (prevState.genreFilter !== this.state.genreFilter
            || prevState.categoryFilter !== this.state.categoryFilter) {
            this.setState({
                loaded: false,
                liveStreams: [],
                livestreamsNextPage: STARTING_PAGE,
                recordedStreams: [],
                recordedStreamsNextPage: STARTING_PAGE,
                events: [],
                eventsNextPage: STARTING_PAGE
            }, async () => {
                await Promise.all([
                    this.getStreams(),
                    this.getEvents()
                ]);
                this.setState({
                    loaded: true
                });
            });
        }
    }

    async getStreams() {
        await Promise.all([
            this.getLiveStreams(),
            this.getPastStreams()
        ]);
    }

    async getLiveStreams() {
        const params = {
            searchQuery: this.props.match.params.query,
            page: this.state.livestreamsNextPage,
            limit: pagination.large
        };

        if (this.state.genreFilter) {
            params.genre = this.state.genreFilter;
        }
        if (this.state.categoryFilter) {
            params.category = this.state.categoryFilter;
        }

        this.setState({showLoadMoreLivestreamsSpinner: true}, async () => {
            try {
                const eventStagesCount = await this.getEventStagesReturningCount(params);
                params.limit = params.limit + (params.limit - eventStagesCount);

                const res = await axios.get('/api/livestreams', {params});

                const liveStreams = [...this.state.liveStreams, ...(res.data.streams || [])];
                if (res.data.streams && res.data.streams.length) {
                    liveStreams.sort((a, b) => b.viewCount - a.viewCount);
                }

                this.setState({
                    liveStreams,
                    livestreamsNextPage: this.state.livestreamsNextPage || res.data.nextPage,
                    showLoadMoreLivestreamsButton: !!(this.state.showLoadMoreLivestreamsButton || res.data.nextPage),
                    showLoadMoreLivestreamsSpinner: false
                });
            } catch (err) {
                this.setState({showLoadMoreLivestreamsSpinner: false});
                displayErrorMessage(this, `An error occurred when loading more livestreams. Please try again later. (${err})`);
            }
        });
    }

    async getEventStagesReturningCount(params) {
        const eventStagesRes = await axios.get(`/api/livestreams/event-stages`, {params});
        this.setState({
            liveStreams: [...this.state.liveStreams, ...(eventStagesRes.data.streams || [])],
            livestreamsNextPage: eventStagesRes.data.nextPage,
            showLoadMoreLivestreamsButton: !!eventStagesRes.data.nextPage
        });
        return eventStagesRes.data.streams ? eventStagesRes.data.streams.length : 0;
    }

    async getPastStreams() {
        const queryParams = {
            params: {
                searchQuery: this.props.match.params.query,
                page: this.state.recordedStreamsNextPage,
                limit: pagination.small
            }
        };

        if (this.state.genreFilter) {
            queryParams.params.genre = this.state.genreFilter;
        }
        if (this.state.categoryFilter) {
            queryParams.params.category = this.state.categoryFilter;
        }

        this.setState({showLoadMorePastStreamsSpinner: true}, async () => {
            try {
                const res = await axios.get('/api/recorded-streams', queryParams);
                this.setState({
                    recordedStreams: [...this.state.recordedStreams, ...(res.data.recordedStreams || [])],
                    recordedStreamsNextPage: res.data.nextPage,
                    showLoadMorePastStreamsButton: !!res.data.nextPage,
                    showLoadMorePastStreamsSpinner: false
                });
            } catch (err) {
                this.setState({showLoadMorePastStreamsSpinner: false});
                displayErrorMessage(this, `An error occurred when loading more past streams. Please try again later. (${err})`);
            }
        });
    }

    async getEvents() {
        const queryParams = {
            params: {
                searchQuery: this.props.match.params.query,
                page: this.state.eventsNextPage,
                limit: pagination.small
            }
        };

        if (this.state.genreFilter) {
            queryParams.params.genre = this.state.genreFilter;
        }
        if (this.state.categoryFilter) {
            queryParams.params.category = this.state.categoryFilter;
        }

        this.setState({showLoadMoreEventsSpinner: true}, async () => {
            try {
                const res = await axios.get('/api/events', queryParams);
                this.setState({
                    events: [...this.state.events, ...(res.data.events || [])],
                    eventsNextPage: res.data.nextPage,
                    showLoadMoreEventsButton: !!res.data.nextPage,
                    showLoadMoreEventsSpinner: false
                });
            } catch (err) {
                this.setState({showLoadMoreEventsSpinner: false});
                displayErrorMessage(this, `An error occurred when loading more events. Please try again later. (${err})`);
            }
        });
    }

    async getUsers() {
        const queryParams = {
            params: {
                searchQuery: this.props.match.params.query,
                page: this.state.usersNextPage,
                limit: pagination.small
            }
        };

        this.setState({showLoadMoreUsersSpinner: true}, async () => {
            try {
                const res = await axios.get('/api/users', queryParams);
                this.setState({
                    users: [...this.state.users, ...(res.data.users || [])],
                    usersNextPage: res.data.nextPage,
                    showLoadMoreUsersButton: !!res.data.nextPage,
                    showLoadMoreUsersSpinner: false
                });
            } catch (err) {
                this.setState({showLoadMoreUsersSpinner: false});
                displayErrorMessage(this, `An error occurred when loading more users. Please try again later. (${err})`);
            }
        });
    }

    genreDropdownToggle() {
        this.setState(prevState => ({
            genreDropdownOpen: !prevState.genreDropdownOpen
        }));
    }

    setGenreFilter(event) {
        this.setState({
            genreFilter: event.currentTarget.textContent
        });
    }

    clearGenreFilter() {
        this.setState({
            genreFilter: ''
        });
    }

    categoryDropdownToggle() {
        this.setState(prevState => ({
            categoryDropdownOpen: !prevState.categoryDropdownOpen
        }));
    }

    setCategoryFilter(event) {
        this.setState({
            categoryFilter: event.currentTarget.textContent
        });
    }

    clearCategoryFilter() {
        this.setState({
            categoryFilter: ''
        });
    }

    renderLiveStreams() {
        const liveStreams = this.state.liveStreams.map((liveStream, index) => (
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

        const loadMoreLiveStreamsButton = this.state.showLoadMoreLivestreamsButton && (
            <div className='text-center mb-4'>
                <Button className='btn-dark' onClick={this.getLiveStreams}>
                    {this.state.showLoadMoreLivestreamsSpinner ? <Spinner size='sm' /> : 'Load More Livestreams'}
                </Button>
            </div>
        );

        return liveStreams.length ? (
            <React.Fragment>
                <Row xs='1' sm='1' md='2' lg='3' xl='3'>
                    {liveStreams}
                </Row>
                {loadMoreLiveStreamsButton}
            </React.Fragment>
        ) : (
            <p className='my-4 text-center'>
                No one matching your search is live right now :(
            </p>
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

        const loadMorePastStreamsButton = this.state.showLoadMorePastStreamsButton && (
            <div className='text-center mb-4'>
                <Button className='btn-dark' onClick={this.getPastStreams}>
                    {this.state.showLoadMorePastStreamsSpinner ? <Spinner size='sm' /> : 'Load More Past Streams'}
                </Button>
            </div>
        );

        return pastStreams.length > 0 && (
            <React.Fragment>
                <h5>Past Streams</h5>
                <hr className='my-4'/>
                <Row xs='1' sm='1' md='2' lg='3' xl='3'>
                    {pastStreams}
                </Row>
                {loadMorePastStreamsButton}
            </React.Fragment>
        );
    }

    renderEvents() {
        const timeNow = moment();

        const events = this.state.events.map((event, index) => {
            const isEventHappeningNow = isTimeBetween({
                time: timeNow,
                start: event.startTime,
                end: event.endTime
            });

            return (
                <Col className='stream margin-bottom-thick' key={index}>
                    {isEventHappeningNow && <span className='live-label'>LIVE</span>}
                    <Link to={`/event/${event._id}`}>
                        <img className='w-100' src={event.thumbnailURL} alt={`${event.eventName} Event Thumbnail`}/>
                    </Link>
                    <table>
                        <tbody>
                        <tr>
                            <td className='w-100'>
                                <h5 className='text-break'>
                                    <Link to={`/user/${event.createdBy.username}`}>
                                        {event.createdBy.displayName || event.createdBy.username}
                                    </Link>
                                    <span className='black-link'>
                                        <Link to={`/event/${event._id}`}>
                                            {` - ${event.eventName}`}
                                        </Link>
                                    </span>
                                </h5>
                                <h6>
                                    {formatDateRange({
                                        start: event.startTime,
                                        end: event.endTime
                                    })}
                                </h6>
                            </td>
                        </tr>
                        </tbody>
                    </table>
                </Col>
            );
        });

        const loadMoreEventsButton = this.state.showLoadMoreEventsButton && (
            <div className='text-center my-4'>
                <Button className='btn-dark' onClick={this.getEvents}>
                    {this.state.showLoadMoreEventsSpinner ? <Spinner size='sm' /> : 'Load More Events'}
                </Button>
            </div>
        );

        return events.length > 0 && (
            <React.Fragment>
                <h5>Events</h5>
                <hr className='my-4'/>
                <Row xs='1' sm='1' md='2' lg='3' xl='3'>
                    {events}
                </Row>
                {loadMoreEventsButton}
            </React.Fragment>
        );
    }

    renderUsers() {
        const users = this.state.users.map((user, index) => (
            <Col className='mb-4' key={index}>
                <h5>
                    <Link to={`/user/${user.username}`}>
                        <img src={user.profilePicURL} width='75' height='75'
                             alt={`${user.username} profile picture`} className='m-2 rounded-circle'/>
                        {user.displayName || user.username}
                    </Link>
                </h5>
            </Col>
        ));

        const loadMoreUsersButton = this.state.showLoadMoreUsersButton && (
            <div className='text-center mb-4'>
                <Button className='btn-dark' onClick={this.getUsers}>
                    {this.state.showLoadMoreUsersSpinner ? <Spinner size='sm' /> : 'Load More Users'}
                </Button>
            </div>
        );

        return users.length > 0 && (
            <React.Fragment>
                <h5>Users</h5>
                <hr className='my-4'/>
                <Row xs='1' sm='1' md='2' lg='3' xl='3'>
                    {users}
                </Row>
                {loadMoreUsersButton}
            </React.Fragment>
        );
    }

    render() {
        const genreDropdownText = this.state.genreFilter || 'Genre';
        const categoryDropdownText = this.state.categoryFilter || 'Category';

        const genres = filters.genres.map((genre, index) => (
            <div key={index}>
                <DropdownItem onClick={this.setGenreFilter}>{genre}</DropdownItem>
            </div>
        ));

        const categories = filters.categories.map((category, index) => (
            <div key={index}>
                <DropdownItem onClick={this.setCategoryFilter}>{category}</DropdownItem>
            </div>
        ));

        return (
            <Container fluid='lg' className={this.state.alertText ? 'mt-4' : 'mt-5'}>
                {getAlert(this)}

                <Row>
                    <Col>
                        <table className='float-right'>
                            <tbody>
                            <tr>
                                <td>
                                    <Dropdown className='dropdown-hover-darkred' isOpen={this.state.genreDropdownOpen}
                                              toggle={this.genreDropdownToggle} size='sm'>
                                        <DropdownToggle caret>{genreDropdownText}</DropdownToggle>
                                        <DropdownMenu right>
                                            <DropdownItem onClick={this.clearGenreFilter}
                                                          disabled={!this.state.genreFilter}>
                                                Clear Filter
                                            </DropdownItem>
                                            <DropdownItem divider/>
                                            {genres}
                                        </DropdownMenu>
                                    </Dropdown>
                                </td>
                                <td>
                                    <Dropdown className='dropdown-hover-darkred' isOpen={this.state.categoryDropdownOpen}
                                              toggle={this.categoryDropdownToggle} size='sm'>
                                        <DropdownToggle caret>{categoryDropdownText}</DropdownToggle>
                                        <DropdownMenu right>
                                            <DropdownItem onClick={this.clearCategoryFilter}
                                                          disabled={!this.state.categoryFilter}>
                                                Clear Filter
                                            </DropdownItem>
                                            <DropdownItem divider/>
                                            {categories}
                                        </DropdownMenu>
                                    </Dropdown>
                                </td>
                            </tr>
                            </tbody>
                        </table>
                        <h4>Search: '{this.props.match.params.query}'</h4>
                    </Col>
                </Row>
                <hr className='my-4'/>
                {!this.state.loaded ? <LoadingSpinner /> : (
                    <React.Fragment>
                        {this.renderLiveStreams()}
                        {this.renderPastStreams()}
                        {this.renderEvents()}
                        {this.renderUsers()}
                    </React.Fragment>
                )}
            </Container>
        );
    }

}