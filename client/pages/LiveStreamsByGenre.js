import React from 'react';
import axios from 'axios';
import {Link} from 'react-router-dom';
import {pagination, filters, siteName} from '../../mainroom.config';
import {Button, Col, Container, Dropdown, DropdownItem, DropdownMenu, DropdownToggle, Row, Spinner} from 'reactstrap';
import {shortenNumber} from '../utils/numberUtils';
import {displayErrorMessage, displayGenreAndCategory, getAlert, LoadingSpinner} from '../utils/displayUtils';
import {timeSince} from '../utils/dateUtils';
import ViewersIcon from '../icons/eye.svg';

const STARTING_PAGE = 1;

export default class LiveStreamsByCategory extends React.Component {

    constructor(props) {
        super(props);

        this.categoryDropdownToggle = this.categoryDropdownToggle.bind(this);
        this.setCategoryFilter = this.setCategoryFilter.bind(this);
        this.clearCategoryFilter = this.clearCategoryFilter.bind(this);
        this.getLiveStreams = this.getLiveStreams.bind(this);

        this.state = {
            pageHeader: '',
            loaded: false,
            liveStreams: [],
            nextPage: STARTING_PAGE,
            categoryDropdownOpen: false,
            categoryFilter: '',
            showLoadMoreButton: false,
            showLoadMoreSpinner: false,
            alertText: '',
            alertColor: ''
        }
    }

    componentDidMount() {
        this.fillComponent();
    }

    componentDidUpdate(prevProps, prevState) {
        document.title = `${decodeURIComponent(this.props.match.params.genre)} Livestreams - ${siteName}`;
        if (prevProps.match.params.genre !== this.props.match.params.genre) {
            this.setState({
                loaded: false,
                liveStreams: [],
                nextPage: STARTING_PAGE,
                categoryFilter: '',
                pageHeader: ''
            }, () => {
                this.fillComponent();
            });
        } else if (prevState.categoryFilter !== this.state.categoryFilter) {
            this.setState({
                loaded: false,
                liveStreams: [],
                nextPage: STARTING_PAGE
            }, () => {
                this.getLiveStreams();
            });
        }
    }

    fillComponent() {
        const queriedGenre = decodeURIComponent(this.props.match.params.genre);
        if (filters.genres.includes(queriedGenre)) {
            this.setState({pageHeader: `${queriedGenre} Livestreams`})
            this.getLiveStreams();
        } else {
            window.location.href = '/404';
        }
    }

    getLiveStreams() {
        const params = {
            page: this.state.nextPage,
            limit: pagination.large
        };
        if (this.props.match.params.genre) {
            params.genre = decodeURIComponent(this.props.match.params.genre);
        }
        if (this.state.categoryFilter) {
            params.category = this.state.categoryFilter;
        }

        this.setState({showLoadMoreSpinner: true}, async () => {
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
                    nextPage: this.state.nextPage || res.data.nextPage,
                    showLoadMoreButton: !!(this.state.showLoadMoreButton || res.data.nextPage),
                    loaded: true,
                    showLoadMoreSpinner: false
                });
            } catch (err) {
                this.setState({showLoadMoreSpinner: false});
                displayErrorMessage(this, `An error occurred when loading more streams. Please try again later. (${err})`);
            }
        });
    }

    async getEventStagesReturningCount(params) {
        const eventStagesRes = await axios.get(`/api/livestreams/event-stages`, {params});
        this.setState({
            liveStreams: [...this.state.liveStreams, ...(eventStagesRes.data.streams || [])],
            nextPage: eventStagesRes.data.nextPage,
            showLoadMoreButton: !!eventStagesRes.data.nextPage
        });
        return eventStagesRes.data.streams ? eventStagesRes.data.streams.length : 0;
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

    render() {
        const streams = this.state.liveStreams.map((liveStream, index) => (
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

        const streamBoxes = streams.length ? (
            <Row xs='1' sm='1' md='2' lg='3' xl='3'>
                {streams}
            </Row>
        ) : (
            <p className='my-4 text-center'>
                No one matching your search is live right now :(
            </p>
        );

        const categoryDropdownText = this.state.categoryFilter || 'Filter';

        const categories = filters.categories.map((category, index) => (
            <div key={index}>
                <DropdownItem onClick={this.setCategoryFilter}>{category}</DropdownItem>
            </div>
        ));

        const loadMoreButton = this.state.showLoadMoreButton && (
            <div className='text-center my-4'>
                <Button className='btn-dark' onClick={this.getLiveStreams}>
                    {this.state.showLoadMoreSpinner ? <Spinner size='sm' /> : 'Load More'}
                </Button>
            </div>
        );

        return (
            <Container fluid='lg' className='mt-5'>
                {getAlert(this)}

                <Row>
                    <Col>
                        <Dropdown className='dropdown-hover-darkred float-right' isOpen={this.state.categoryDropdownOpen}
                                  toggle={this.categoryDropdownToggle} size='sm'>
                            <DropdownToggle caret>{categoryDropdownText}</DropdownToggle>
                            <DropdownMenu right>
                                <DropdownItem onClick={this.clearCategoryFilter} disabled={!this.state.categoryFilter}>
                                    Clear Filter
                                </DropdownItem>
                                <DropdownItem divider/>
                                {categories}
                            </DropdownMenu>
                        </Dropdown>
                        <h4>{this.state.pageHeader}</h4>
                    </Col>
                </Row>
                <hr className='my-4'/>
                {!this.state.loaded ? <LoadingSpinner /> : (
                    <React.Fragment>
                        {streamBoxes}
                        {loadMoreButton}
                    </React.Fragment>
                )}
            </Container>
        );
    }
}