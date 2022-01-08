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

        this.getSubscriptions = this.getSubscriptions.bind(this);

        this.state = {
            subscriptions: [],
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
        this.isProfileOfLoggedInUser();
        this.getSubscriptions();
    }

    async isProfileOfLoggedInUser() {
        const res = await axios.get('/api/logged-in-user');
        this.setState({
            isProfileOfLoggedInUser: res.data.username === this.props.match.params.username.toLowerCase(),
        });
    }

    getSubscriptions() {
        this.setState({showLoadMoreSpinner: true}, async () => {
            try {
                const res = await axios.get(`/api/users/${this.props.match.params.username.toLowerCase()}/subscriptions`, {
                    params: {
                        page: this.state.nextPage,
                        limit: pagination.large
                    }
                });
                document.title = `${this.props.match.params.username.toLowerCase()}'s Subscriptions - ${siteName}`;
                const subscriptions = res.data.subscriptions.map((subscription, index) => (
                    <div key={index}>
                        <Col>
                            <h5>
                                <Link to={`/user/${subscription.username}`}>
                                    <img src={subscription.profilePicURL} width='75' height='75'
                                         alt={`${subscription.username} profile picture`}
                                         className='mr-3 rounded-circle'/>
                                    {subscription.username}
                                </Link>
                            </h5>
                        </Col>
                    </div>
                ));
                this.setState({
                    subscriptions: [...this.state.subscriptions, ...subscriptions],
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
                    displayErrorMessage(this, `An error occurred when loading more subscriptions. Please try again later. (${err})`);
                }
            }
        });
    }

    render() {
        const subscriptions = this.state.subscriptions.length
            ? <Row xs='1' sm='2' md='2' lg='3' xl='3'>{this.state.subscriptions}</Row>
            : <p className='my-4 text-center'>{this.state.isProfileOfLoggedInUser ? 'You are '
                : this.props.match.params.username.toLowerCase() + ' is'} not subscribed to anybody :(</p>;

        const loadMoreButton = this.state.showLoadMoreButton && (
            <div className='text-center my-4'>
                <Button className='btn-dark' onClick={this.getSubscriptions}>
                    {this.state.showLoadMoreSpinner ? <Spinner size='sm' /> : 'Load More'}
                </Button>
            </div>
        );

        return !this.state.loaded ? <LoadingSpinner /> : (
            <Container fluid='lg' className='my-5'>
                {getAlert(this)}

                <Row>
                    <Col>
                        <h4>{this.props.match.params.username.toLowerCase()}'s Subscriptions</h4>
                    </Col>
                </Row>
                <hr className='mt-4'/>
                {subscriptions}
                {loadMoreButton}
            </Container>
        );
    }

}