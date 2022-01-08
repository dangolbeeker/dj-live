import React, {Suspense, lazy} from 'react';
import axios from 'axios';
import {
    Button,
    Col,
    Container,
    Modal,
    ModalBody,
    ModalFooter,
    ModalHeader,
    Row,
    Spinner
} from 'reactstrap';
import {Link} from 'react-router-dom';
import {headTitle, pagination, siteName, validation, storage} from '../../mainroom.config';
import {formatDateRange, timeSince} from '../utils/dateUtils';
import {shortenNumber} from '../utils/numberUtils';
import {
    displayErrorMessage,
    displayGenreAndCategory,
    displaySuccessMessage,
    getAlert,
    LoadingSpinner
} from '../utils/displayUtils';
import ScheduleIcon from '../icons/calendar-white-20.svg';
import RecordedStreamsIcon from '../icons/film-white-20.svg';
import EditProfileIcon from '../icons/edit-white.svg';
import SubscribeIcon from '../icons/user-plus.svg';
import SubscribedIcon from '../icons/user-check.svg';
import AddIcon from '../icons/plus-white-20.svg';
import RemoveIcon from '../icons/x.svg';
import DeleteIcon from '../icons/trash.svg';
import TickIcon from '../icons/check-white-20.svg';
import LocationIcon from '../icons/map-pin-20.svg';
import CameraIcon from '../icons/camera-white-20.svg';
import ViewersIcon from '../icons/eye.svg';

const ImageUploader = lazy(() => import('react-images-upload'));

const STARTING_PAGE = 1;

const STARTING_STATE = {
    loaded: false,
    loggedInUser: '',
    loggedInUserId: '',
    isLoggedInUserSubscribed: false,
    profilePicURL: '',
    displayName: '',
    location: '',
    bio: '',
    chatColour: '',
    links: [],
    numOfSubscribers: 0,
    scheduledStreams: [],
    scheduledStreamsInLoggedInUserSchedule: [],
    streamKey: '',
    streamTitle: '',
    streamGenre: '',
    streamCategory: '',
    streamStartTime: '',
    streamThumbnailUrl: '',
    streamViewCount: 0,
    editProfileOpen: false,
    unsavedChanges: false,
    editDisplayName: '',
    editLocation: '',
    editBio: '',
    editLinks: [],
    indexesOfInvalidLinks: [],
    showChangeProfilePicButton: false,
    changeProfilePicOpen: false,
    uploadedProfilePic: undefined,
    recordedStreams: [],
    showLoadMoreButton: false,
    showChangeProfilePicSpinner: false,
    showEditProfileSpinner: false,
    showLoadMoreSpinner: false,
    alertText: '',
    alertColor: '',
    nextPage: STARTING_PAGE
};

export default class UserProfile extends React.Component {

    constructor(props) {
        super(props);

        this.onClickSubscribeButton = this.onClickSubscribeButton.bind(this);
        this.editProfileToggle = this.editProfileToggle.bind(this);
        this.setDisplayName = this.setDisplayName.bind(this);
        this.setLocation = this.setLocation.bind(this);
        this.setBio = this.setBio.bind(this);
        this.setChatColour = this.setChatColour.bind(this);
        this.generateRandomColour = this.generateRandomColour.bind(this);
        this.addLink = this.addLink.bind(this);
        this.setLinkTitle = this.setLinkTitle.bind(this);
        this.setLinkUrl = this.setLinkUrl.bind(this);
        this.saveProfile = this.saveProfile.bind(this);
        this.mouseEnterProfilePic = this.mouseEnterProfilePic.bind(this);
        this.mouseLeaveProfilePic = this.mouseLeaveProfilePic.bind(this);
        this.changeProfilePicToggle = this.changeProfilePicToggle.bind(this);
        this.onProfilePicUpload = this.onProfilePicUpload.bind(this);
        this.saveNewProfilePic = this.saveNewProfilePic.bind(this);
        this.getRecordedStreams = this.getRecordedStreams.bind(this);
        this.closeEditProfileOpenChangeProfilePic = this.closeEditProfileOpenChangeProfilePic.bind(this);

        this.state = STARTING_STATE;
    }

    componentDidMount() {
        document.title = headTitle;
        this.loadUserProfile();
    }

    componentDidUpdate(prevProps) {
        if (prevProps.match.params.username !== this.props.match.params.username.toLowerCase()) {
            this.reloadProfile();
        }
    }

    async loadUserProfile() {
        try {
            await Promise.all([
                this.getUserData(),
                this.getUpcomingStreams(),
                this.getLiveStreamIfLive(),
                this.getRecordedStreams(),
                this.getLoggedInUser()
            ]);
            this.setState({
                loaded: true
            });
        } catch (err) {
            if (err.response.status === 404) {
                window.location.href = '/404';
            } else {
                throw err;
            }
        }
    }

    async getUserData() {
        const res = await axios.get(`/api/users/${this.props.match.params.username.toLowerCase()}`);
        document.title = `${res.data.displayName || this.props.match.params.username.toLowerCase().toLowerCase()} - ${siteName}`;
        this.setState({
            profilePicURL: res.data.profilePicURL,
            displayName: res.data.displayName,
            location: res.data.location,
            bio: res.data.bio,
            chatColour: res.data.chatColour,
            links: res.data.links,
            numOfSubscribers: res.data.numOfSubscribers,
        });
    }

    async getUpcomingStreams() {
        const res = await axios.get('/api/scheduled-streams', {
            params: {
                username: this.props.match.params.username.toLowerCase(),
                scheduleStartTime: Date.now()
            }
        });
        this.setState({
            scheduledStreams: res.data.scheduledStreams
        });
    }

    async getLoggedInUser() {
        const res = await axios.get('/api/logged-in-user')
        this.setState({
            loggedInUser: res.data.username,
            loggedInUserId: res.data._id
        }, () => {
            Promise.all([
                this.isLoggedInUserSubscribed(),
                this.getScheduledStreamsInLoggedInUserSchedule()
            ]);
        });
    }

    async isLoggedInUserSubscribed() {
        if (this.state.loggedInUser && this.state.loggedInUser !== this.props.match.params.username.toLowerCase()) {
            const res = await axios.get(`/api/users/${this.state.loggedInUser}/subscribed-to/${this.props.match.params.username.toLowerCase()}`);
            this.setState({
                isLoggedInUserSubscribed: res.data
            });
        }
    }

    async getScheduledStreamsInLoggedInUserSchedule() {
        if (this.state.loggedInUser && this.state.loggedInUser !== this.props.match.params.username.toLowerCase()) {
            const res = await axios.get(`/api/users/${this.state.loggedInUser}/schedule/non-subscribed`, {
                params: {
                    scheduledStreamUsername: this.props.match.params.username.toLowerCase()
                }
            });
            this.setState({
                scheduledStreamsInLoggedInUserSchedule: [
                    ...this.state.scheduledStreamsInLoggedInUserSchedule,
                    ...res.data.nonSubscribedScheduledStreams
                ]
            });
        }
    }

    reloadProfile() {
        this.setState(STARTING_STATE, () => this.loadUserProfile());
    }

    async subscribeToUser() {
        try {
            await axios.post(`/api/users/${this.state.loggedInUser}/subscribe/${this.props.match.params.username.toLowerCase()}`);
            this.setState({
                isLoggedInUserSubscribed: true,
                numOfSubscribers: this.state.numOfSubscribers + 1
            });
        } catch (err) {
            displayErrorMessage(this, `An error occurred when subscribing to event. Please try again later. (${err})`);
        }
    }

    async unsubscribeFromUser() {
        try {
            await axios.post(`/api/users/${this.state.loggedInUser}/unsubscribe/${this.props.match.params.username.toLowerCase()}`);
            this.setState({
                isLoggedInUserSubscribed: false,
                numOfSubscribers: this.state.numOfSubscribers - 1
            });
        } catch (err) {
            displayErrorMessage(this, `An error occurred when unsubscribing from event. Please try again later. (${err})`);
        }
    }

    async getLiveStreamIfLive() {
        const streamInfoRes = await axios.get(`/api/users/${this.props.match.params.username.toLowerCase()}/stream-info`);
        if (streamInfoRes.data.isLive) {
            const streamKey = streamInfoRes.data.streamKey;
            const thumbnailRes = await axios.get(`/api/livestreams/${streamKey}/thumbnail`);
            this.setState({
                streamKey,
                streamTitle: streamInfoRes.data.title,
                streamGenre: streamInfoRes.data.genre,
                streamCategory: streamInfoRes.data.category,
                streamViewCount: streamInfoRes.data.viewCount,
                streamStartTime: streamInfoRes.data.startTime,
                streamThumbnailUrl: thumbnailRes.data.thumbnailURL
            });
        }
    }

    async getRecordedStreams() {
        this.setState({showLoadMoreSpinner: true}, async () => {
            try {
                const res = await axios.get(`/api/recorded-streams`, {
                    params: {
                        username: this.props.match.params.username.toLowerCase(),
                        page: this.state.nextPage,
                        limit: pagination.small
                    }
                });
                this.setState({
                    recordedStreams: [...this.state.recordedStreams, ...(res.data.recordedStreams || [])],
                    nextPage: res.data.nextPage,
                    showLoadMoreButton: !!res.data.nextPage,
                    showLoadMoreSpinner: false
                });
            } catch (err) {
                this.setState({showLoadMoreSpinner: false});
                displayErrorMessage(this, `An error occurred when loading past streams. Please try again later. (${err})`);
            }
        });
    }

    onClickSubscribeButton() {
        this.state.isLoggedInUserSubscribed ? this.unsubscribeFromUser() : this.subscribeToUser();
    }

    renderSubscribeOrEditProfileButton() {
        return this.state.loggedInUser ? (
            this.state.loggedInUser === this.props.match.params.username.toLowerCase() ? (
                <Button className='btn-dark w-100' onClick={this.editProfileToggle}>
                    <img src={EditProfileIcon} className='float-left' alt='Edit Profile icon'/>
                    Edit Profile
                </Button>
            ) : (
                <Button className='btn-dark w-100' onClick={this.onClickSubscribeButton}>
                    <img src={this.state.isLoggedInUserSubscribed ? SubscribedIcon : SubscribeIcon} className='float-left'
                         alt={this.state.isLoggedInUserSubscribed ? 'Subscribed icon' : 'Subscribe icon'}/>
                    {this.state.isLoggedInUserSubscribed ? 'Subscribed' : 'Subscribe'}
                </Button>
            )
        ) : (
            <Button className='btn-dark w-100' href={`/login?redirectTo=${window.location.pathname}`}>
                <img src={SubscribeIcon} className='float-left' alt='Subscribe icon'/>
                Subscribe
            </Button>
        );
    }

    renderLinks() {
        return this.state.links.map((link, index) => (
            <div key={index}>
                <img src={`https://www.google.com/s2/favicons?domain=${link.url}`} />
                <a href={link.url} target='_blank' rel='noopener noreferrer'
                   className='text-truncate ml-1' title={link.title || link.url}>
                    {link.title || link.url}
                </a>
            </div>
        ));
    }

    renderLiveStream() {
        return this.state.streamKey && (
            <React.Fragment>
                <Row className='mb-2'>
                    <Col>
                        <h3>Live Now</h3>
                    </Col>
                </Row>
                <Row>
                    <Col className='stream' md='6'>
                        <span className='live-label'>LIVE</span>
                        <span className='view-count'>
                            <img src={ViewersIcon} width={18} height={18} className='mr-1 my-1' alt='Viewers icon'/>
                            {shortenNumber(this.state.streamViewCount)}
                        </span>
                        <Link to={`/user/${this.props.match.params.username.toLowerCase()}/live`}>
                            <img className='w-100' src={this.state.streamThumbnailUrl}
                                 alt={`${this.props.match.params.username.toLowerCase()} Stream Thumbnail`}/>
                        </Link>
                    </Col>
                    <Col md='6'>
                        <h3 className='black-link text-break'>
                            <Link to={`/user/${this.props.match.params.username.toLowerCase()}/live`}>
                                {this.state.streamTitle}
                            </Link>
                        </h3>
                        <h6>
                            {displayGenreAndCategory({
                                genre: this.state.streamGenre,
                                category: this.state.streamCategory
                            })}
                        </h6>
                        <h6>Started {timeSince(this.state.streamStartTime)}</h6>
                    </Col>
                </Row>
                <hr className='mb-4'/>
            </React.Fragment>
        );
    }

    async addToSchedule(streamId) {
        if (this.state.loggedInUser) {
            const res = await axios.patch(`/api/users/${this.state.loggedInUser}/schedule/add-non-subscribed/${streamId}`);
            if (res.status === 200) {
                this.setState({
                    scheduledStreamsInLoggedInUserSchedule: [...this.state.scheduledStreamsInLoggedInUserSchedule, streamId]
                });
            }
        } else {
            window.location.href = `/login?redirectTo=${window.location.pathname}`;
        }
    }

    async removeFromSchedule(streamId) {
        try {
            await axios.patch(`/api/users/${this.state.loggedInUser}/schedule/remove-non-subscribed/${streamId}`);
            const arrayWithStreamRemoved = this.state.scheduledStreamsInLoggedInUserSchedule.filter(id => id !== streamId);
            this.setState({
                scheduledStreamsInLoggedInUserSchedule: arrayWithStreamRemoved
            });
        } catch (err) {
            displayErrorMessage(this, `An error occurred when removing stream from schedule. Please try again later. (${err})`);
        }
    }

    async cancelStream(streamId) {
        try {
            await axios.delete(`/api/scheduled-streams/${streamId}`);
            this.reloadProfile();
            displaySuccessMessage(this, 'Successfully cancelled scheduled stream');
        } catch (err) {
            displayErrorMessage(this, `An error occurred when cancelling scheduled stream. Please try again later. (${err})`);
        }
    }

    renderUpcomingStreams() {
        const scheduledStreams = this.state.scheduledStreams.map((stream, index) => {
            const button = this.state.loggedInUser === this.props.match.params.username.toLowerCase() ? (
                <a href='javascript:;' className='float-right' title={`Cancel '${stream.title}'`}
                   onClick={() => this.cancelStream(stream._id)}>
                    <img src={DeleteIcon} width={20} height={20} className='mb-1' alt='Cancel Stream icon'/>
                </a>
            ) : (
                this.state.isLoggedInUserSubscribed || this.state.scheduledStreamsInLoggedInUserSchedule.some(id => id === stream._id) ? (
                    <Button className='float-right btn-dark' size='sm'
                            onClick={!this.state.isLoggedInUserSubscribed && !stream.eventStage && (() => this.removeFromSchedule(stream._id))}>
                        <span title={!this.state.isLoggedInUserSubscribed && !stream.eventStage && `Remove '${stream.title}' from Schedule`}>
                            <img src={TickIcon} className='mr-1' alt='In Schedule icon'/>
                            In Schedule
                        </span>
                    </Button>
                ) : (
                    !stream.eventStage && (
                        <Button className='float-right btn-dark' size='sm' onClick={() => this.addToSchedule(stream._id)}>
                            <img src={AddIcon} className='mr-1' alt='Add to Schedule icon'/>
                            Add to Schedule
                        </Button>
                    )
                )
            );
            return (
                <Col className='margin-bottom-thick' key={index} md='6'>
                    {button}
                    <h5>
                        {stream.eventStage && (
                            <React.Fragment>
                                <Link to={`/event/${stream.eventStage.event._id}`}>
                                    {stream.eventStage.stageName}
                                </Link>
                                {stream.title && ' - '}
                            </React.Fragment>
                        )}
                        {stream.title}
                    </h5>
                    <h6>
                        {displayGenreAndCategory({
                            genre: stream.genre,
                            category: stream.category
                        })}
                    </h6>
                    {formatDateRange({
                        start: stream.startTime,
                        end: stream.endTime
                    })}
                    {stream.eventStage && (
                        <h6>
                            Scheduled as part of&nbsp;
                            <Link to={`/event/${stream.eventStage.event._id}`}>
                                {stream.eventStage.event.eventName}
                            </Link>
                        </h6>
                    )}
                </Col>
            );
        });

        const goToScheduleButton = this.state.loggedInUser === this.props.match.params.username.toLowerCase() && (
            <div className='float-right'>
                <Button className='btn-dark' tag={Link} to={'/schedule'} size='sm'>
                    <img src={ScheduleIcon} className='mr-1' alt='Schedule icon'/>
                    Go to Schedule
                </Button>
            </div>
        );

        return (
            <React.Fragment>
                <Row className='mb-2'>
                    <Col>
                        {goToScheduleButton}
                        <h3>Upcoming Streams</h3>
                    </Col>
                </Row>
                <Row>
                    {scheduledStreams.length ? scheduledStreams : (
                        <Col>
                            <p>{this.state.displayName || this.props.match.params.username.toLowerCase()} has no upcoming streams.</p>
                        </Col>
                    )}
                </Row>
            </React.Fragment>
        );
    }

    renderPastStreams() {
        const pastStreams = this.state.recordedStreams.map((stream, index) => (
            <Row key={index} className='margin-bottom-thick'>
                <Col className='stream' md='6' lg='4'>
                    <span className='video-duration'>{stream.videoDuration}</span>
                    <span className='view-count'>
                        <img src={ViewersIcon} width={18} height={18} className='mr-1 my-1' alt='Views icon'/>
                        {shortenNumber(stream.viewCount)}
                    </span>
                    <Link to={`/stream/${stream._id}`}>
                        <img className='w-100' src={stream.thumbnailURL}
                             alt={`${stream.title} Stream Thumbnail`}/>
                    </Link>
                </Col>
                <Col md='6' lg='8'>
                    <h5 className='black-link text-break'>
                        <Link to={`/stream/${stream._id}`}>
                            {stream.title}
                        </Link>
                    </h5>
                    <h6>
                        {displayGenreAndCategory({
                            genre: stream.genre,
                            category: stream.category
                        })}
                    </h6>
                    <h6>{timeSince(stream.timestamp)}</h6>
                </Col>
            </Row>
        ));

        const manageRecordedStreamsButton = this.state.loggedInUser === this.props.match.params.username.toLowerCase() && (
            <div className='float-right'>
                <Button className='btn-dark' tag={Link} to={'/manage-recorded-streams'} size='sm'>
                    <img src={RecordedStreamsIcon} className='mr-1' alt='Recorded Streams icon'/>
                    Manage Recorded Streams
                </Button>
            </div>
        );

        const loadMoreButton = this.state.showLoadMoreButton && (
            <div className='text-center my-4'>
                <Button className='btn-dark' onClick={this.getRecordedStreams}>
                    {this.state.showLoadMoreSpinner ? <Spinner size='sm' /> : 'Load More'}
                </Button>
            </div>
        );

        return (
            <React.Fragment>
                <Row className='mb-2'>
                    <Col>
                        {manageRecordedStreamsButton}
                        <h3>Past Streams</h3>
                    </Col>
                </Row>
                {pastStreams.length ? pastStreams : (
                    <Row>
                        <Col>
                            <p>{this.state.displayName || this.props.match.params.username.toLowerCase()} has no past streams.</p>
                        </Col>
                    </Row>
                )}
                {loadMoreButton}
            </React.Fragment>
        );
    }

    editProfileToggle() {
        this.setState(prevState => ({
            editProfileOpen: !prevState.editProfileOpen,
            editDisplayName: this.state.displayName,
            editLocation: this.state.location,
            editBio: this.state.bio,
            editLinks: this.state.links.map(link => ({...link})) // copy all link objects so changes don't pass through
        }));
    }

    setDisplayName(event) {
        this.setState({
            editDisplayName: event.target.value,
            unsavedChanges: true
        });
    }

    setLocation(event) {
        this.setState({
            editLocation: event.target.value,
            unsavedChanges: true
        });
    }

    setBio(event) {
        this.setState({
            editBio: event.target.value,
            unsavedChanges: true
        });
    }

    setChatColour() {
        const chatColour = document.getElementById('chatColour');
        this.setState({
            chatColour: chatColour.value,
            unsavedChanges: true
        });
    }

    generateRandomColour() {
        this.setState({showEditProfileSpinner: true}, async () => {
            try {
                const res = await axios.post(`/api/users/${this.state.loggedInUser}/chat-colour`);
                this.setState({
                    chatColour: res.data.chatColour,
                    showEditProfileSpinner: false
                });
            } catch (err) {
                this.setState({
                    editProfileOpen: false,
                    showEditProfileSpinner: false
                });
                displayErrorMessage(this, `An error occurred when generating a random chat colour. Please try again later. (${err})`);
            }
        });
    }

    setLinkTitle(event, index) {
        const links = this.state.editLinks;
        links[index].title = event.target.value;
        this.setState({
            editLinks: links,
            unsavedChanges: true
        });
    }

    setLinkUrl(event, index) {
        const links = this.state.editLinks;
        links[index].url = event.target.value;
        this.setState({
            editLinks: links,
            unsavedChanges: true
        });
    }

    saveProfile() {
        this.setState({showEditProfileSpinner: true}, async () => {
            if (await this.validateLinks()) {
                try {
                    await axios.patch(`/api/users/${this.state.loggedInUser}`, {
                        displayName: this.state.editDisplayName,
                        location: this.state.editLocation,
                        bio: this.state.editBio,
                        chatColour: this.state.chatColour,
                        links: this.state.editLinks
                    });
                    this.reloadProfile();
                    displaySuccessMessage(this, 'Successfully updated profile');
                } catch (err) {
                    if (err.response.status === 400) {
                        this.setState({
                            indexesOfInvalidLinks: err.response.data.indexesOfInvalidLinks
                        });
                    } else {
                        displayErrorMessage(this, `An error occurred when updating profile. Please try again later. (${err})`);
                    }
                }
            }
            this.setState({showEditProfileSpinner: false});
        });
    }

    async validateLinks() {
        let isValid = true;
        this.setState({
            indexesOfInvalidLinks: this.state.editLinks.map((link, index) => {
                if (!link.url) {
                    isValid = false;
                    return index;
                }
            })
        });
        return isValid;
    }

    addLink() {
        this.setState({
            editLinks: [...this.state.editLinks, {
                title: '',
                url: ''
            }],
            unsavedChanges: true
        });
    }

    removeLink(index) {
        const links = this.state.editLinks;
        links.splice(index, 1);
        this.setState({
            editLinks: links,
            unsavedChanges: true
        });
    }

    closeEditProfileOpenChangeProfilePic() {
        this.setState({editProfileOpen: false}, () => {
            setTimeout(() => {
                this.setState({changeProfilePicOpen: true})
            }, 400); // set small timeout to avoid funky resizing due to scrollbar changing between modals
        });
    }

    renderEditLinks() {
        const headers = this.state.editLinks.length > 0 && (
            <Row>
                <Col className='remove-padding-r' xs='4' lg='4'>Title:</Col>
                <Col className='remove-padding-l ml-1' xs='6' lg='7'>URL:</Col>
            </Row>
        );

        const links = this.state.editLinks.map((link, index) => (
            <Row className='mt-1' key={index}>
                <Col className='remove-padding-r' xs='4'>
                    <input className='rounded-border w-100' type='text' value={link.title}
                           onChange={e => this.setLinkTitle(e, index)}
                           maxLength={validation.profile.linkTitleMaxLength}/>
                </Col>
                <Col className='remove-padding-lr' xs='7'>
                    <input className='rounded-border w-100 mx-1' type='text' value={link.url}
                           onChange={e => this.setLinkUrl(e, index)}/>
                </Col>
                <Col className='remove-padding-l' xs='1'>
                    <a href='javascript:;' onClick={() => this.removeLink(index)}>
                        <img src={RemoveIcon} className='ml-2' alt='Remove Link icon'/>
                    </a>
                </Col>
                <Col xs='12'>
                    {this.state.indexesOfInvalidLinks.includes(index) && <small className='text-danger'>Invalid URL</small>}
                </Col>
            </Row>
        ));

        return (
            <React.Fragment>
                {headers}
                {links}
            </React.Fragment>
        );
    }

    renderEditProfile() {
        return (
            <Modal isOpen={this.state.editProfileOpen} toggle={this.editProfileToggle} size='lg' centered={true}>
                <ModalHeader toggle={this.editProfileToggle}>Edit Profile</ModalHeader>
                <ModalBody>
                    <Container fluid className='remove-padding-lr'>
                        <Row>
                            <Col xs='12'>
                                <h5>Profile Picture</h5>
                            </Col>
                            <Col xs='12'>
                                <Button className='btn-dark' size='sm' onClick={this.closeEditProfileOpenChangeProfilePic}>
                                    <img src={CameraIcon} className='mr-2 mb-1' alt='Change Profile Pic icon'/>
                                    Change Profile Picture
                                </Button>
                            </Col>
                            <Col className='mt-2' xs='12'>
                                <h5>Display Name</h5>
                            </Col>
                            <Col xs='12'>
                                <input className='rounded-border w-50' type='text' value={this.state.editDisplayName}
                                       onChange={this.setDisplayName} maxLength={validation.profile.displayNameMaxLength} />
                            </Col>
                            <Col className='mt-2' xs='12'>
                                <h5>Location</h5>
                            </Col>
                            <Col xs='12'>
                                <input className='rounded-border w-50' type='text' value={this.state.editLocation}
                                       onChange={this.setLocation} maxLength={validation.profile.locationMaxLength} />
                            </Col>
                            <Col className='mt-2' xs='12'>
                                <h5>Bio</h5>
                            </Col>
                            <Col xs='12'>
                                <textarea className='rounded-border w-100' value={this.state.editBio}
                                          onChange={this.setBio} maxLength={validation.profile.bioMaxLength} />
                            </Col>
                            <Col className='mt-2' xs='12'>
                                <h5>Chat Colour</h5>
                            </Col>
                            <Col xs='12'>
                                <input id='chatColour' className='h-100 float-left' type='color'
                                       value={this.state.chatColour} onChange={this.setChatColour}/>
                                &nbsp;or&nbsp;
                                <Button className='btn-dark' size='sm' onClick={this.generateRandomColour}>
                                    Generate Random Colour
                                </Button>
                            </Col>
                        </Row>
                    </Container>
                    <h5 className='mt-4'>Links</h5>
                    <hr/>
                    <Container fluid className='remove-padding-lr'>
                        {this.renderEditLinks()}
                        <Row className='mt-2'>
                            <Col xs='12'>
                                <Button className='btn-dark' size='sm' onClick={this.addLink}>
                                    <img src={AddIcon} className='mr-1' alt='Add Link icon'/>
                                    Add Link
                                </Button>
                            </Col>
                        </Row>
                    </Container>
                </ModalBody>
                <ModalFooter>
                    <Button className='btn-dark' disabled={!this.state.unsavedChanges} onClick={this.saveProfile}>
                        {this.state.showEditProfileSpinner && <Spinner size='sm' />}
                        <span className={this.state.showEditProfileSpinner && 'sr-only'}>
                            Save Changes
                        </span>
                    </Button>
                </ModalFooter>
            </Modal>
        );
    }

    mouseEnterProfilePic() {
        this.setState({
            showChangeProfilePicButton: true
        });
    }

    mouseLeaveProfilePic() {
        this.setState({
            showChangeProfilePicButton: false
        });
    }

    changeProfilePicToggle() {
        this.setState(prevState => ({
            changeProfilePicOpen: !prevState.changeProfilePicOpen
        }));
    }

    onProfilePicUpload(pictureFiles) {
        this.setState({
            uploadedProfilePic: pictureFiles[0]
        });
    }

    saveNewProfilePic() {
        this.setState({showChangeProfilePicSpinner: true}, async () => {
            const data = new FormData();
            data.set(storage.formDataKeys.profilePic, this.state.uploadedProfilePic);

            try {
                await axios.put(`/api/users/${this.state.loggedInUserId}/profile-pic`, data, {
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    }
                });
                location.reload(); // reload page to refresh profile pic in browser cache
            } catch (err) {
                this.setState({showChangeProfilePicSpinner: false});
                this.changeProfilePicToggle();
                displayErrorMessage(this, `An error occurred when updating profile picture. Please try again later. (${err})`);
            }
        });
    }

    renderChangeProfilePic() {
        return this.state.changeProfilePicOpen && (
            <Modal isOpen={this.state.changeProfilePicOpen} toggle={this.changeProfilePicToggle} centered={true}>
                <ModalHeader toggle={this.changeProfilePicToggle}>Change Profile Picture</ModalHeader>
                <ModalBody>
                    <Suspense fallback={<LoadingSpinner />}>
                        <ImageUploader buttonText='Choose Image' label='Maximum file size: 2MB'
                                       maxFileSize={2 * 1024 * 1024} onChange={this.onProfilePicUpload}
                                       withPreview={true} singleImage={true} withIcon={false}/>
                    </Suspense>
                </ModalBody>
                <ModalFooter>
                    <Button className='btn-dark' disabled={!this.state.uploadedProfilePic}
                            onClick={this.saveNewProfilePic}>
                        {this.state.showChangeProfilePicSpinner && <Spinner size='sm' />}
                        <span className={this.state.showChangeProfilePicSpinner && 'sr-only'}>
                            Upload
                        </span>
                    </Button>
                </ModalFooter>
            </Modal>
        );
    }

    renderProfilePic() {
        const profilePic = <img src={this.state.profilePicURL}
                                alt={`${this.props.match.params.username.toLowerCase()} Profile Picture`}/>;

        const changeProfilePicButton = (
            <Button className='btn-dark change-profile-pic-btn' onClick={this.changeProfilePicToggle}>
                Change Profile Picture
            </Button>
        );

        return this.state.loggedInUser === this.props.match.params.username.toLowerCase() ? (
            <div className='profile-pic'
                 onMouseEnter={this.mouseEnterProfilePic} onMouseLeave={this.mouseLeaveProfilePic}>
                {profilePic}
                {this.state.showChangeProfilePicButton && changeProfilePicButton}
            </div>
        ) : (
            <div className='profile-pic'>
                {profilePic}
            </div>
        );
    }

    render() {
        return !this.state.loaded ? <LoadingSpinner /> : (
            <React.Fragment>
                <Container fluid='lg'>
                    {getAlert(this)}

                    <Row className={this.state.alertText ? 'mt-4' : 'mt-5'}>
                        <Col md='4' lg='3'>
                            {this.renderProfilePic()}
                            <h1 className='text-break' title={this.state.displayName || this.props.match.params.username.toLowerCase()}>
                                {this.state.displayName || this.props.match.params.username.toLowerCase()}
                            </h1>
                            {this.state.location &&
                                <h5 className='text-break'>
                                    <img src={LocationIcon} className='mr-1 mb-1' alt='Location icon'/>
                                    {this.state.location}
                                </h5>
                            }
                            <h5 className='black-link text-break'>
                                <Link to={`/user/${this.props.match.params.username.toLowerCase()}/subscribers`}>
                                    {shortenNumber(this.state.numOfSubscribers)} Subscriber{this.state.numOfSubscribers === 1 ? '' : 's'}
                                </Link>
                            </h5>
                            {this.renderSubscribeOrEditProfileButton()}
                            <p className='text-break mt-1'>
                                {this.state.bio}
                            </p>
                            {this.renderLinks()}
                            <hr className='my-4'/>
                        </Col>
                        <Col md='8' lg='9'>
                            {this.renderLiveStream()}
                            {this.renderUpcomingStreams()}
                            <hr className='my-4'/>
                            {this.renderPastStreams()}
                        </Col>
                    </Row>
                </Container>

                {this.renderChangeProfilePic()}
                {this.renderEditProfile()}
            </React.Fragment>
        );
    }

}