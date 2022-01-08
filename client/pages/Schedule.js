import React from 'react';
import axios from 'axios';
import Timeline from 'react-calendar-timeline'
import moment from 'moment'
import {
    Button,
    Col,
    Container,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownToggle,
    Modal,
    ModalBody,
    ModalFooter,
    ModalHeader,
    Row,
    Spinner
} from 'reactstrap';
import DateTimeRangeContainer from 'react-advanced-datetimerange-picker';
import {convertLocalToUTC, convertUTCToLocal, formatDateRange} from '../utils/dateUtils';
import {
    displayErrorMessage,
    displayGenreAndCategory,
    displaySuccessMessage,
    getAlert,
    LoadingSpinner
} from '../utils/displayUtils';
import {filters, siteName, dateFormat, validation} from '../../mainroom.config';
import {Link} from 'react-router-dom';
import PlusIcon from '../icons/plus-white.svg';
import CalendarIcon from '../icons/calendar-white-20.svg';
import WhiteDeleteIcon from '../icons/trash-white-20.svg';

export default class Schedule extends React.Component {

    constructor(props) {
        super(props);

        this.applyDate = this.applyDate.bind(this);
        this.scheduleStreamToggle = this.scheduleStreamToggle.bind(this);
        this.genreDropdownToggle = this.genreDropdownToggle.bind(this);
        this.categoryDropdownToggle = this.categoryDropdownToggle.bind(this);
        this.setTitle = this.setTitle.bind(this);
        this.setGenre = this.setGenre.bind(this);
        this.clearGenre = this.clearGenre.bind(this);
        this.setCategory = this.setCategory.bind(this);
        this.clearCategory = this.clearCategory.bind(this);
        this.setTags = this.setTags.bind(this);
        this.scheduleStreamApplyDate = this.scheduleStreamApplyDate.bind(this);
        this.addToSchedule = this.addToSchedule.bind(this);
        this.selectScheduledStream = this.selectScheduledStream.bind(this);
        this.deselectScheduledStream = this.deselectScheduledStream.bind(this);

        this.state = {
            loaded: false,
            loggedInUser: '',
            loggedInUserId: '',
            scheduleGroups: [],
            scheduleItems: [],
            startTime: moment(),
            endTime: moment().add(24, 'hour'),
            genres: [],
            categories: [],
            scheduleStreamOpen: false,
            scheduleStreamStartTime: moment(),
            scheduleStreamEndTime: moment().add(1, 'hour'),
            scheduleStreamTitle: '',
            scheduleStreamGenre: '',
            scheduleStreamCategory: '',
            scheduleStreamTags: [],
            showAddToScheduleSpinner: false,
            alertText: '',
            alertColor: '',
            selectedScheduleItem: undefined
        }
    }

    componentDidMount() {
        document.title = `Schedule - ${siteName}`;
        this.getScheduleIfLoggedIn();
    }

    async getScheduleIfLoggedIn() {
        const res = await axios.get('/api/logged-in-user');
        if (res.data.username) {
            this.setState({
                loggedInUser: res.data.username,
                loggedInUserId: res.data._id
            }, () => {
                this.getSchedule();
            });
        } else {
            window.location.href = `/login?redirectTo=${window.location.pathname}`;
        }
    }

    async getSchedule() {
        const res = await axios.get(`/api/users/${this.state.loggedInUser}/schedule`, {
            params: {
                scheduleStartTime: convertLocalToUTC(this.state.startTime).toDate(),
                scheduleEndTime: convertLocalToUTC(this.state.endTime).toDate()
            }
        });

        const scheduleItems = res.data.scheduleItems.map(scheduleItem => {
            // JSON serializes dates as strings, so parse start and end times into moment objects
            scheduleItem.start_time = convertUTCToLocal(scheduleItem.start_time);
            scheduleItem.end_time = convertUTCToLocal(scheduleItem.end_time);

            // disable movement of schedule item
            scheduleItem.canMove = false;
            scheduleItem.canResize = false;
            scheduleItem.canChangeGroup = false;

            scheduleItem.itemProps = {
                onDoubleClick: () => this.selectScheduledStream(scheduleItem.id)
            };

            return scheduleItem;
        });

        this.setState({
            scheduleGroups: res.data.scheduleGroups,
            scheduleItems,
            loaded: true
        });
    }

    getDatePickerRange() {
        return {
            'Next 6 Hours': [moment(), moment().add(6, 'hours')],
            'Next 12 Hours': [moment(), moment().add(12, 'hours')],
            'Next 24 Hours': [moment(), moment().add(24, 'hours')],
            'Today': [moment().startOf('day'), moment().endOf('day')],
            'Tomorrow': [moment().startOf('day').add(1, 'day'), moment().endOf('day').add(1, 'day')],
            'Next 3 Days': [moment().startOf('day'), moment().add(3, 'days').startOf('day')],
            'Next 7 Days': [moment().startOf('day'), moment().add(1, 'week').startOf('day')],
            'This Weekend': [moment().isoWeekday('Saturday').startOf('day'), moment().isoWeekday('Sunday').endOf('day')],
            'This Week': [moment().startOf('isoWeek'), moment().endOf('isoWeek')],
            'Next Weekend': [moment().isoWeekday('Saturday').startOf('day').add(1, 'week'), moment().isoWeekday('Sunday').endOf('day').add(1, 'week')],
            'Next Week': [moment().startOf('isoWeek').add(1, 'week'), moment().endOf('isoWeek').add(1, 'week')]
        };
    }

    getDatePickerFormat() {
        return {
            'format': dateFormat,
            'sundayFirst': false
        };
    }

    applyDate(startTime, endTime) {
        this.setState({
            loaded: false,
            startTime: startTime,
            endTime: endTime
        }, () => {
            this.getSchedule();
        });
    }

    scheduleStreamToggle() {
        this.setState(prevState => ({
            scheduleStreamOpen: !prevState.scheduleStreamOpen
        }), () => {
            if (this.state.scheduleStreamOpen && !(this.state.genres.length || this.state.categories.length)) {
                this.getFilters();
            }
        });
    }

    getFilters() {
        const genres = filters.genres.map((genre, index) => (
            <div key={index}>
                <DropdownItem onClick={this.setGenre}>{genre}</DropdownItem>
            </div>
        ));

        const categories = filters.categories.map((category, index) => (
            <div key={index}>
                <DropdownItem onClick={this.setCategory}>{category}</DropdownItem>
            </div>
        ));

        this.setState({
            genres,
            categories
        });
    }

    genreDropdownToggle() {
        this.setState(prevState => ({
            genreDropdownOpen: !prevState.genreDropdownOpen
        }));
    }

    categoryDropdownToggle() {
        this.setState(prevState => ({
            categoryDropdownOpen: !prevState.categoryDropdownOpen
        }));
    }

    setTitle(event) {
        this.setState({
            scheduleStreamTitle: event.target.value
        });
    }

    setGenre(event) {
        this.setState({
            scheduleStreamGenre: event.currentTarget.textContent
        });
    }

    clearGenre() {
        this.setState({
            scheduleStreamGenre: ''
        });
    }

    setCategory(event) {
        this.setState({
            scheduleStreamCategory: event.currentTarget.textContent,
        });
    }

    clearCategory() {
        this.setState({
            scheduleStreamCategory: ''
        });
    }

    setTags(event) {
        const tags = event.target.value.replace(/\s/g, '').split(',');
        if (tags.length > validation.streamSettings.tagsMaxAmount) {
            return;
        }
        this.setState({
            scheduleStreamTags: tags
        });
    }

    scheduleStreamApplyDate(startTime, endTime) {
        this.setState({
            scheduleStreamStartTime: startTime,
            scheduleStreamEndTime: endTime
        });
    }

    addToSchedule() {
        this.setState({showAddToScheduleSpinner: true}, async () => {
            try {
                await axios.post('/api/scheduled-streams', {
                    userId: this.state.loggedInUserId,
                    startTime: convertLocalToUTC(this.state.scheduleStreamStartTime),
                    endTime: convertLocalToUTC(this.state.scheduleStreamEndTime),
                    title: this.state.scheduleStreamTitle,
                    genre: this.state.scheduleStreamGenre,
                    category: this.state.scheduleStreamCategory,
                    tags: this.state.scheduleStreamTags
                });

                const dateRange = formatDateRange({
                    start: this.state.scheduleStreamStartTime,
                    end: this.state.scheduleStreamEndTime
                });
                const alertText = `Successfully scheduled ${this.state.scheduleStreamTitle ? 
                    `'${this.state.scheduleStreamTitle}'` : 'stream'} for ${dateRange}`;

                this.setState({
                    scheduleStreamStartTime: moment(),
                    scheduleStreamEndTime: moment().add(1, 'hour'),
                    scheduleStreamTitle: '',
                    scheduleStreamGenre: '',
                    scheduleStreamCategory: '',
                    scheduleStreamTags: [],
                    loaded: false
                }, () => {
                    displaySuccessMessage(this, alertText);
                    this.getSchedule();
                });
            } catch (err) {
                displayErrorMessage(this, `An error occurred when creating scheduled stream. Please try again later. (${err})`);
            }
            this.scheduleStreamToggle();
            this.setState({showAddToScheduleSpinner: false});
        });
    }

    isNoMobileMode() {
        const mdBreakpointValue = window.getComputedStyle(document.documentElement)
            .getPropertyValue('--breakpoint-md')
            .replace('px', '');
        return window.screen.width >= mdBreakpointValue;
    }

    selectScheduledStream(itemId, e, time) {
        this.setState({
            selectedScheduleItem: this.state.scheduleItems[itemId]
        });
    }

    deselectScheduledStream() {
        this.setState({
            selectedScheduleItem: undefined
        });
    }

    async cancelStream(streamId) {
        try {
            await axios.delete(`/api/scheduled-streams/${streamId}`);
            this.setState({selectedScheduleItem: undefined}, () => {
                displaySuccessMessage(this, 'Successfully cancelled scheduled stream');
                this.getSchedule();
            });
        } catch (err) {
            displayErrorMessage(this, `An error occurred when cancelling scheduled stream. Please try again later. (${err})`);
        }
    }

    async removeFromSchedule(streamId) {
        try {
            await axios.patch(`/api/users/${this.state.loggedInUser}/schedule/remove-non-subscribed/${streamId}`);
            this.setState({selectedScheduleItem: undefined}, () => {
                displaySuccessMessage(this, 'Successfully removed stream from schedule');
                this.getSchedule();
            });
        } catch (err) {
            displayErrorMessage(this, `An error occurred when removing stream from schedule. Please try again later. (${err})`);
        }
    }

    renderScheduleStream() {
        return (
            <Modal isOpen={this.state.scheduleStreamOpen} toggle={this.scheduleStreamToggle} centered={true}>
                <ModalHeader toggle={this.scheduleStreamToggle}>
                    Schedule a Stream
                </ModalHeader>
                <ModalBody>
                    <Container fluid className='remove-padding-lr'>
                        <Row>
                            <Col xs='12'>
                                <h5>Date & Time</h5>
                            </Col>
                            <Col xs='12'>
                                <DateTimeRangeContainer start={this.state.scheduleStreamStartTime}
                                                        end={this.state.scheduleStreamEndTime}
                                                        ranges={this.getDatePickerRange()}
                                                        local={this.getDatePickerFormat()}
                                                        noMobileMode={this.isNoMobileMode()}
                                                        applyCallback={this.scheduleStreamApplyDate} autoApply
                                                        style={{standaloneLayout: {display: 'flex', maxWidth: 'fit-content'}}}>
                                    <Dropdown className='dropdown-hover-darkred' size='sm' toggle={() => {}}>
                                        <DropdownToggle caret>
                                            {formatDateRange({
                                                start: this.state.scheduleStreamStartTime,
                                                end: this.state.scheduleStreamEndTime
                                            })}
                                        </DropdownToggle>
                                    </Dropdown>
                                </DateTimeRangeContainer>
                            </Col>
                            <Col className='mt-2' xs='12'>
                                <h5>Title</h5>
                            </Col>
                            <Col xs='12'>
                                <input className='w-100 rounded-border' type='text' value={this.state.scheduleStreamTitle}
                                       onChange={this.setTitle} maxLength={validation.streamSettings.titleMaxLength} />
                            </Col>
                            <Col className='mt-2' xs='12'>
                                <h5>Genre</h5>
                            </Col>
                            <Col xs='12'>
                                <Dropdown className='dropdown-hover-darkred' isOpen={this.state.genreDropdownOpen}
                                          toggle={this.genreDropdownToggle} size='sm'>
                                    <DropdownToggle caret>
                                        {this.state.scheduleStreamGenre || 'Select a genre...'}
                                    </DropdownToggle>
                                    <DropdownMenu>
                                        <DropdownItem onClick={this.clearGenre}
                                                      disabled={!this.state.scheduleStreamGenre}>
                                            Clear Genre
                                        </DropdownItem>
                                        <DropdownItem divider/>
                                        {this.state.genres}
                                    </DropdownMenu>
                                </Dropdown>
                            </Col>
                            <Col className='mt-2' xs='12'>
                                <h5>Category</h5>
                            </Col>
                            <Col xs='12'>
                                <Dropdown className='dropdown-hover-darkred' isOpen={this.state.categoryDropdownOpen}
                                          toggle={this.categoryDropdownToggle} size='sm'>
                                    <DropdownToggle caret>
                                        {this.state.scheduleStreamCategory || 'Select a category...'}
                                    </DropdownToggle>
                                    <DropdownMenu>
                                        <DropdownItem onClick={this.clearCategory}
                                                      disabled={!this.state.scheduleStreamCategory}>
                                            Clear Category
                                        </DropdownItem>
                                        <DropdownItem divider/>
                                        {this.state.categories}
                                    </DropdownMenu>
                                </Dropdown>
                            </Col>
                            <Col className='mt-2' xs='12'>
                                <h5>Tags</h5>
                            </Col>
                            <Col xs='12'>
                                <input className='rounded-border w-100' type='text'
                                       value={this.state.scheduleStreamTags} onChange={this.setTags}/>
                            </Col>
                            <Col xs='12'>
                                <i>Up to {validation.streamSettings.tagsMaxAmount} comma-separated tags, no spaces</i>
                            </Col>
                        </Row>
                    </Container>
                </ModalBody>
                <ModalFooter>
                    <Button className='btn-dark' onClick={this.addToSchedule}>
                        {this.state.showAddToScheduleSpinner && <Spinner size='sm' />}
                        <span className={this.state.showAddToScheduleSpinner && 'sr-only'}>
                            Add to Schedule
                        </span>
                    </Button>
                </ModalFooter>
            </Modal>
        );
    }

    renderSelectedScheduledStream() {
        const scheduledStream = this.state.selectedScheduleItem;
        return scheduledStream && (
            <Modal isOpen={true} toggle={this.deselectScheduledStream} centered={true}>
                <ModalBody>
                    <table>
                        <tbody>
                            <tr>
                                {!scheduledStream.event && (
                                    <td>
                                        <Link to={`/user/${scheduledStream.user.username}`}>
                                            <img className='rounded-circle m-2' src={scheduledStream.user.profilePicURL}
                                                 width='75' height='75'
                                                 alt={`${scheduledStream.user.username} profile picture`}/>
                                        </Link>
                                    </td>
                                )}
                                <td valign='middle' className='w-100'>
                                    <h5>
                                        <Link to={scheduledStream.event ? `/event/${scheduledStream.event._id}` : `/user/${scheduledStream.user.username}`}>
                                            {scheduledStream.event ? scheduledStream.event.stageName : (scheduledStream.user.displayName || scheduledStream.user.username)}
                                        </Link>
                                        {scheduledStream.title ? ` - ${scheduledStream.title}` : ''}
                                    </h5>
                                    <h6>
                                        {displayGenreAndCategory({
                                            genre: scheduledStream.genre,
                                            category: scheduledStream.category
                                        })}
                                    </h6>
                                    {formatDateRange({
                                        start: scheduledStream.start_time,
                                        end: scheduledStream.end_time
                                    })}
                                    {scheduledStream.event && (
                                        <h6>
                                            Scheduled as part of&nbsp;
                                            <Link to={`/event/${scheduledStream.event._id}`}>
                                                {scheduledStream.event.eventName}
                                            </Link>
                                        </h6>
                                    )}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </ModalBody>
                {scheduledStream.user._id === this.state.loggedInUserId && (
                    <ModalFooter>
                        <Button className='btn-danger' size='sm' onClick={() => this.cancelStream(scheduledStream._id)}>
                            <img src={WhiteDeleteIcon} width={18} height={18} className='mr-1 mb-1'
                                 alt='Cancel Stream icon'/>
                            Cancel Stream
                        </Button>
                    </ModalFooter>
                )}
                {scheduledStream.isNonSubscribed && !scheduledStream.event && (
                    <ModalFooter>
                        <i>You are not subscribed to {scheduledStream.user.displayName || scheduledStream.user.username}</i>
                        <Button className='btn-dark' size='sm' onClick={() => this.removeFromSchedule(scheduledStream._id)}>
                            Remove From Schedule
                        </Button>
                    </ModalFooter>
                )}
            </Modal>
        );
    }

    render() {
        return !this.state.loaded ? <LoadingSpinner /> : (
            <React.Fragment>
                <Container fluid>
                    {getAlert(this)}

                    <Row className={this.state.alertText ? 'mt-4' : 'mt-5'}>
                        <Col>
                            <Button className='btn-dark float-right' onClick={this.scheduleStreamToggle}>
                                <img src={PlusIcon} width={22} height={22} className='mr-1'
                                     alt='Schedule a Stream icon'/>
                                Schedule a Stream
                            </Button>
                            <h4>Schedule</h4>
                        </Col>
                    </Row>
                    <hr className='mt-4'/>
                    <Row>
                        <Col>
                            <div className='float-right mb-1'>
                                <DateTimeRangeContainer ranges={this.getDatePickerRange()} local={this.getDatePickerFormat()}
                                                        start={this.state.startTime} end={this.state.endTime}
                                                        applyCallback={this.applyDate} leftMode={true}
                                                        noMobileMode={this.isNoMobileMode()}>
                                    <Dropdown className='dropdown-hover-darkred' size='sm' toggle={() => {}}>
                                        <DropdownToggle caret>
                                            <img src={CalendarIcon} width={18} height={18} className='mr-2 mb-1'
                                                 alt='Select Time Period icon'/>
                                            Select Time Period
                                        </DropdownToggle>
                                    </Dropdown>
                                </DateTimeRangeContainer>
                            </div>
                            <Timeline groups={this.state.scheduleGroups} items={this.state.scheduleItems}
                                      onItemSelect={this.selectScheduledStream} onItemClick={this.selectScheduledStream}
                                      visibleTimeStart={this.state.startTime.valueOf()}
                                      visibleTimeEnd={this.state.endTime.valueOf()}/>
                            <p className='my-3 text-center'>
                                {this.state.scheduleGroups.length > 1 ? ''
                                    : 'Streams scheduled by your subscriptions during the selected time period will appear here'}
                            </p>
                        </Col>
                    </Row>
                </Container>

                {this.renderScheduleStream()}
                {this.renderSelectedScheduledStream()}
            </React.Fragment>
        )
    }

}