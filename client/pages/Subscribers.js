import React from 'react';
import axios from 'axios';
import {Button, Col, Container, Row, Spinner} from 'reactstrap';
import {Link} from 'react-router-dom';
import {headTitle, siteName, pagination} from '../../mainroom.config';
import {displayErrorMessage, getAlert, LoadingSpinner} from '../utils/displayUtils';

const STARTING_PAGE = 1;

export default class Subscribers extends React.Component {

    constructor(props) {
        super(props);

        this.getSubscribers = this.getSubscribers.bind(this);

        this.state = {
            pageTitle: '',
            eventName: '',
            subscribers: [],
            nextPage: STARTING_PAGE,
            isProfileOfLoggedInUser: false,
            loaded: false,
            showLoadMoreButton: false,
            showLoadMoreSpinner: false,
            alertText: '',
            alertColor: ''
        }
    }

    componentDidMount() {
        document.title = headTitle;
        if (this.props.match.params.username) {
            this.isProfileOfLoggedInUser();
        }
        this.getSubscribers();
    }

    async isProfileOfLoggedInUser() {
        const res = await axios.get('/api/logged-in-user');
        this.setState({
            isProfileOfLoggedInUser: res.data.username === this.props.match.params.username.toLowerCase(),
        });
    }

    getSubscribers() {
        this.setState({showLoadMoreSpinner: true}, async () => {
            try {
                let url;
                if (this.props.match.params.username) {
                    url = `/api/users/${this.props.match.params.username.toLowerCase()}/subscribers`;
                    this.setPageTitle(`${this.props.match.params.username.toLowerCase()}'s Subscribers`);
                } else if (this.props.match.params.eventId) {
                    url = `/api/events/${this.props.match.params.eventId}/subscribers`;
                    this.getEventName();
                } else {
                    window.location.href = '/404';
                }

                const res = await axios.get(url, {
                    params: {
                        page: this.state.nextPage,
                        limit: pagination.large
                    }
                });
                const subscribers = res.data.subscribers.map((subscriber, index) => (
                    <div key={index}>
                        <Col>
                            <h5>
                                <Link to={`/user/${subscriber.username}`}>
                                    <img src={subscriber.profilePicURL} width='75' height='75'
                                         alt={`${subscriber.username} profile picture`}
                                         className='mr-3 rounded-circle'/>
                                    {subscriber.username}
                                </Link>
                            </h5>
                        </Col>
                    </div>
                ));
                this.setState({
                    subscribers: [...this.state.subscribers, ...subscribers],
                    nextPage: res.data.nextPage,
                    showLoadMoreButton: !!res.data.nextPage,
                    loaded: true,
                    showLoadMoreSpinner: false
                });
            } catch (err) {
                if (err.response.status === 404) {
                    window.location.href = '/404';
                } else {
                    this.setState({showLoadMoreSpinner: false});
                    displayErrorMessage(this, `An error occurred when loading more subscribers. Please try again later. (${err})`);
                }
            }
        });
    }

    async getEventName() {
        try {
            const res = await axios.get(`/api/events/${this.props.match.params.eventId}/event-name`);
            this.setState({
                eventName: res.data.eventName
            }, () => {
                this.setPageTitle(`${this.state.eventName}'s Subscribers`);
            });
        } catch (err) {
            displayErrorMessage(this, `An error occurred when getting event name. Please try again later. (${err})`);
        }
    }

    setPageTitle(pageTitle) {
        this.setState( {pageTitle});
        document.title = `${pageTitle} - ${siteName}`;
    }

    render() {
        const subscribers = this.state.subscribers.length
            ? <Row xs='1' sm='2' md='2' lg='3' xl='3'>{this.state.subscribers}</Row>
            : <p className='my-4 text-center'>{this.state.isProfileOfLoggedInUser ? 'You have '
                : this.props.match.params.username ? this.props.match.params.username.toLowerCase() : this.state.eventName + ' has'} no subscribers :(</p>;

        const loadMoreButton = this.state.showLoadMoreButton && (
            <div className='text-center my-4'>
                <Button className='btn-dark' onClick={this.getSubscribers}>
                    {this.state.showLoadMoreSpinner ? <Spinner size='sm' /> : 'Load More'}
                </Button>
            </div>
        );

        return !this.state.loaded ? <LoadingSpinner /> : (
            <Container fluid='lg' className='my-5'>
                {getAlert(this)}

                <Row>
                    <Col>
                        <h4>{this.state.pageTitle}</h4>
                    </Col>
                </Row>
                <hr className='mt-4'/>
                {subscribers}
                {loadMoreButton}
            </Container>
        );
    }

}