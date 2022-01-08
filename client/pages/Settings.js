import React from 'react';
import axios from 'axios';
import {Button, Col, Container, Modal, ModalBody, ModalFooter, ModalHeader, Row, Spinner} from 'reactstrap';
import {displayErrorMessage, displaySuccessMessage, getAlert, LoadingSpinner} from '../utils/displayUtils';
import {siteName} from '../../mainroom.config';
import WhiteDeleteIcon from '../icons/trash-white-20.svg';

const SUCCESSFUL_UPDATE_PARAM = 'success';
const SUCCESSFUL_UPDATE_MESSAGE = 'Successfully updated account settings';

export default class Settings extends React.Component {

    constructor(props) {
        super(props);

        this.setUsername = this.setUsername.bind(this);
        this.setEmail = this.setEmail.bind(this);
        this.setCurrentPassword = this.setCurrentPassword.bind(this);
        this.setNewPassword = this.setNewPassword.bind(this);
        this.setConfirmNewPassword = this.setConfirmNewPassword.bind(this);
        this.saveSettings = this.saveSettings.bind(this);
        this.changePasswordToggle = this.changePasswordToggle.bind(this);
        this.changePassword = this.changePassword.bind(this);
        this.changePasswordHandleKeyDown = this.changePasswordHandleKeyDown.bind(this);
        this.handleEmailSettingsChange = this.handleEmailSettingsChange.bind(this);
        this.deleteAccountToggle = this.deleteAccountToggle.bind(this);
        this.deleteAccount = this.deleteAccount.bind(this);

        this.state = {
            loggedInUserId: '',
            loaded: false,
            startingUsername: '',
            username: '',
            startingEmail: '',
            email: '',
            startingEmailSettings: undefined,
            emailSettings: undefined,
            usernameInvalidReason: '',
            emailInvalidReason: '',
            changePasswordOpen: false,
            currentPassword: '',
            newPassword: '',
            confirmNewPassword: '',
            currentPasswordInvalidReason: '',
            newPasswordInvalidReason: '',
            confirmNewPasswordInvalidReason: '',
            deleteAccountOpen: false,
            showSaveSettingsSpinner: false,
            showChangePasswordSpinner: false,
            showDeleteAccountSpinner: false,
            alertText: '',
            alertColor: ''
        }
    }

    componentDidMount() {
        document.title = `Settings - ${siteName}`;
        this.fillComponentIfLoggedIn();
        this.displaySuccessMessageAfterReload();
    }

    async fillComponentIfLoggedIn() {
        const res = await axios.get('/api/logged-in-user');
        if (res.data.username) {
            this.setState({
                loggedInUserId: res.data._id
            }, () => {
                this.getUsernameAndEmail();
            });
        } else {
            window.location.href = `/login?redirectTo=${window.location.pathname}`;
        }
    }

    async getUsernameAndEmail() {
        const res = await axios.get(`/api/users/${this.state.loggedInUserId}/settings`);
        this.setState({
            startingUsername: res.data.username,
            username: res.data.username,
            startingEmail: res.data.email,
            email: res.data.email,
            startingEmailSettings: Object.assign({}, res.data.emailSettings),
            emailSettings: res.data.emailSettings,
            loaded: true
        });
    }

    displaySuccessMessageAfterReload() {
        const queryParams = new URLSearchParams(this.props.location.search);
        const wasSuccessfulUpdate = queryParams.get(SUCCESSFUL_UPDATE_PARAM);
        if (wasSuccessfulUpdate) {
            displaySuccessMessage(this, SUCCESSFUL_UPDATE_MESSAGE);
        }
    }

    setUsername(event) {
        this.setState({
            username: event.target.value
        });
    }

    setEmail(event) {
        this.setState({
            email: event.target.value
        });
    }

    enableSaveButton() {
        return this.isUsernameChanged() || this.isEmailChanged() || this.isEmailSettingsChanged();
    }

    isUsernameChanged() {
        return this.state.username !== this.state.startingUsername;
    }

    isEmailChanged() {
        return this.state.email !== this.state.startingEmail;
    }

    isEmailSettingsChanged() {
        const settings = Object.keys(this.state.emailSettings);
        for (const setting of settings) {
            if (this.state.emailSettings[setting] != this.state.startingEmailSettings[setting]) {
                return true;
            }
        }
        return false;
    }

    saveSettings() {
        this.setState({showSaveSettingsSpinner: true}, async () => {
            const data = {
                username: this.state.username,
                updateUsername: this.isUsernameChanged(),
                email: this.state.email,
                updateEmail: this.isEmailChanged()
            };
            if (this.isEmailSettingsChanged()) {
                data.emailSettings = this.state.emailSettings;
            }
            try {
                const res = await axios.patch(`/api/users/${this.state.loggedInUserId}/settings`, data);
                this.setState({
                    usernameInvalidReason: res.data.usernameInvalidReason || '',
                    emailInvalidReason: res.data.emailInvalidReason || '',
                    showSaveSettingsSpinner: false
                });
                if (!(res.data.usernameInvalidReason || res.data.emailInvalidReason)) {
                    if (this.isUsernameChanged()) {
                        // if username has changed, reload page to update components that use username (e.g. Links)
                        window.location.href = `${window.location.pathname}?${SUCCESSFUL_UPDATE_PARAM}=true`;
                    } else {
                        this.setState({
                            startingEmail: this.state.email,
                            startingEmailSettings: this.state.emailSettings
                        });
                        displaySuccessMessage(this, SUCCESSFUL_UPDATE_MESSAGE);
                    }
                }
            } catch (err) {
                this.setState({showSaveSettingsSpinner: false});
                displayErrorMessage(this, `An error occurred when updating account settings. Please try again later. (${err})`);
            }
        });
    }

    setCurrentPassword(event) {
        this.setState({
            currentPassword: event.target.value
        });
    }

    setNewPassword(event) {
        this.setState({
            newPassword: event.target.value
        });
    }

    setConfirmNewPassword(event) {
        this.setState({
            confirmNewPassword: event.target.value
        });
    }

    changePasswordToggle() {
        this.setState(prevState => ({
            changePasswordOpen: !prevState.changePasswordOpen,
            currentPassword: '',
            newPassword: '',
            confirmNewPassword: ''
        }));
    }

    changePasswordHandleKeyDown(e) {
        if (e.key === 'Enter' && this.enableChangePasswordButton()) {
            this.changePassword();
        }
    }

    changePassword() {
        this.setState({showChangePasswordSpinner: true}, async () => {
            try {
                const res = await axios.post(`/api/users/${this.state.loggedInUserId}/password`, {
                    currentPassword: this.state.currentPassword,
                    newPassword: this.state.newPassword,
                    confirmNewPassword: this.state.confirmNewPassword
                });
                this.setState({
                    currentPasswordInvalidReason: res.data.currentPasswordInvalidReason || '',
                    newPasswordInvalidReason: res.data.newPasswordInvalidReason || '',
                    confirmNewPasswordInvalidReason: res.data.confirmNewPasswordInvalidReason || '',
                    showChangePasswordSpinner: false
                });
                if (!(this.state.currentPasswordInvalidReason
                    || this.state.newPasswordInvalidReason
                    || this.state.confirmNewPasswordInvalidReason)) {
                    this.changePasswordToggle();
                    displaySuccessMessage(this, 'Successfully updated password');
                }
            } catch (err) {
                this.setState({showChangePasswordSpinner: false});
                this.changePasswordToggle();
                displayErrorMessage(this, `An error occurred when updating password. Please try again later. (${err})`);
            }
        });
    }

    getNewPasswordInvalidReason() {
        return typeof this.state.newPasswordInvalidReason === 'string' ? this.state.newPasswordInvalidReason
            : this.state.newPasswordInvalidReason.map((line, index) => (
                <div key={index}>
                    {line}<br/>
                </div>
            ));
    }

    enableChangePasswordButton() {
        return this.state.currentPassword && this.state.newPassword && this.state.confirmNewPassword;
    }

    handleEmailSettingsChange(event) {
        const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        const name = event.target.name;
        const newEmailSettings = this.state.emailSettings;
        newEmailSettings[name] = value;
        this.setState({
            emailSettings: newEmailSettings
        });
    }

    deleteAccountToggle() {
        this.setState(prevState => ({
            deleteAccountOpen: !prevState.deleteAccountOpen
        }));
    }

    deleteAccount() {
        this.setState({showDeleteAccountSpinner: true}, async () => {
            const res = await axios.delete(`/api/users/${this.state.loggedInUserId}`);
            if (res.status === 200) {
                window.location.href = '/logout';
            }
        });
    }

    renderChangePassword() {
        const newPasswordInvalidReason = this.getNewPasswordInvalidReason();

        return (
            <Modal isOpen={this.state.changePasswordOpen} toggle={this.changePasswordToggle} centered={true} size='sm'>
                <ModalHeader toggle={this.changePasswordToggle}>
                    Change Password
                </ModalHeader>
                <ModalBody>
                    <Container fluid className='remove-padding-lr'>
                        <Row>
                            <Col xs='12'>
                                <h6>Current Password:</h6>
                            </Col>
                            <Col xs='12'>
                                <input className='w-100 rounded-border' type='password' value={this.state.currentPassword}
                                       onChange={this.setCurrentPassword} onKeyDown={this.changePasswordHandleKeyDown} />
                            </Col>
                            {this.state.currentPasswordInvalidReason && (
                                <Col xs='12'>
                                    <small className='text-danger'>
                                        {this.state.currentPasswordInvalidReason}
                                    </small>
                                </Col>
                            )}
                            <Col className='mt-2' xs='12'>
                                <h6>New Password:</h6>
                            </Col>
                            <Col xs='12'>
                                <input className='w-100 rounded-border' type='password' value={this.state.newPassword}
                                       onChange={this.setNewPassword} onKeyDown={this.changePasswordHandleKeyDown} />
                            </Col>
                            {newPasswordInvalidReason && (
                                <Col xs='12'>
                                    <small className='text-danger'>
                                        {newPasswordInvalidReason}
                                    </small>
                                </Col>
                            )}
                            <Col className='mt-2' xs='12'>
                                <h6>Confirm New Password:</h6>
                            </Col>
                            <Col xs='12'>
                                <input className='w-100 rounded-border' type='password' value={this.state.confirmNewPassword}
                                       onChange={this.setConfirmNewPassword} onKeyDown={this.changePasswordHandleKeyDown} />
                            </Col>
                            {this.state.confirmNewPasswordInvalidReason && (
                                <Col xs='12'>
                                    <small className='text-danger'>
                                        {this.state.confirmNewPasswordInvalidReason}
                                    </small>
                                </Col>
                            )}
                        </Row>
                    </Container>
                </ModalBody>
                <ModalFooter>
                    <Button className='btn-dark' onClick={this.changePassword}
                            disabled={!this.enableChangePasswordButton()}>
                        {this.state.showChangePasswordSpinner && <Spinner size='sm' />}
                        <span className={this.state.showChangePasswordSpinner && 'sr-only'}>
                            Change Password
                        </span>
                    </Button>
                </ModalFooter>
            </Modal>
        );
    }

    renderDeleteAccount() {
        return (
            <Modal isOpen={this.state.deleteAccountOpen} toggle={this.deleteAccountToggle} size='md' centered={true}>
                <ModalHeader toggle={this.deleteAccountToggle}>
                    Permanently Delete Account
                </ModalHeader>
                <ModalBody>
                    <p>Are you sure you want to permanently delete your account, and all data associated with it?</p>
                </ModalBody>
                <ModalFooter>
                    <Button className='btn-danger' onClick={this.deleteAccount}>
                        {this.state.showDeleteAccountSpinner && <Spinner size='sm' />}
                        <span className={this.state.showDeleteAccountSpinner && 'sr-only'}>
                            <img src={WhiteDeleteIcon} className='mr-2 mb-1' alt='Permanently Delete Account icon'/>
                            Delete Account
                        </span>
                    </Button>
                </ModalFooter>
            </Modal>
        );
    }

    render() {
        return !this.state.loaded ? <LoadingSpinner /> : (
            <React.Fragment>
                <Container fluid='lg'>
                    {getAlert(this)}

                    <Row className={this.state.alertText ? 'mt-4' : 'mt-5'}>
                        <Col>
                            <h4>Account Settings</h4>
                        </Col>
                    </Row>
                    <hr className='my-4'/>
                    <Row>
                        <Col xs='12'>
                            <h5>Username</h5>
                        </Col>
                        <Col xs='12'>
                            <input className='rounded-border w-25-md w-100-xs' type='text' value={this.state.username}
                                   onChange={this.setUsername}/>
                            <div className='ml-1'>
                                {this.state.usernameInvalidReason}
                            </div>
                        </Col>
                        <Col className='mt-2' xs='12'>
                            <h5>Email Address</h5>
                        </Col>
                        <Col xs='12'>
                            <input className='rounded-border w-25-md w-100-xs' type='text' value={this.state.email}
                                   onChange={this.setEmail}/>
                            <div className='ml-1'>
                                {this.state.emailInvalidReason}
                            </div>
                        </Col>
                        <Col className='mt-2' xs='12'>
                            <h5>Change Password</h5>
                        </Col>
                        <Col xs='12'>
                            <Button className='btn-dark' size='sm' onClick={this.changePasswordToggle}>
                                Click to change password
                            </Button>
                        </Col>
                    </Row>
                    <hr className='my-4'/>
                    <Row>
                        <Col xs='12'>
                            <h5>Email Settings</h5>
                        </Col>
                        <Col className='mt-2' xs='12'>
                            <form>
                                <label>
                                    <input name='newSubscribers' type='checkbox' className='mr-1'
                                           checked={this.state.emailSettings.newSubscribers}
                                           onChange={this.handleEmailSettingsChange}/>
                                    Send emails about new subscribers
                                </label>
                                <br />
                                <label>
                                    <input name='subscriptionWentLive' type='checkbox' className='mr-1'
                                           checked={this.state.emailSettings.subscriptionWentLive}
                                           onChange={this.handleEmailSettingsChange}/>
                                    Send an email when someone I am subscribed to goes live
                                </label>
                                <br />
                                <label>
                                    <input name='subscriptionsCreatedScheduledStreams' type='checkbox' className='mr-1'
                                           checked={this.state.emailSettings.subscriptionsCreatedScheduledStreams}
                                           onChange={this.handleEmailSettingsChange}/>
                                    Send emails about scheduled livestreams created by users I am subscribed to
                                </label>
                                <br />
                                <label>Send an email when someone I am subscribed to has a stream scheduled to start:
                                    <select name='subscriptionScheduledStreamStartingIn' className='ml-1'
                                            value={this.state.emailSettings.subscriptionScheduledStreamStartingIn}
                                            onChange={this.handleEmailSettingsChange}>
                                        <option value={-1}>Never</option>
                                        <option value={10}>10 minutes before</option>
                                        <option value={30}>30 minutes before</option>
                                        <option value={60}>1 hour before</option>
                                        <option value={60 * 2}>2 hours before</option>
                                        <option value={60 * 6}>6 hours before</option>
                                        <option value={60 * 24}>1 day before</option>
                                    </select>
                                </label>
                            </form>
                        </Col>
                    </Row>
                    <hr className='my-4'/>
                    <Row>
                        <Col xs='12'>
                            <h5>Delete Account</h5>
                        </Col>
                        <Col className='mt-2' xs='12'>
                            <Button className='btn-danger' size='sm' onClick={this.deleteAccountToggle}>
                                <img src={WhiteDeleteIcon} width={18} height={18} className='mr-1 mb-1'
                                     alt='Permanently Delete Account icon'/>
                                Click to permanently delete account
                            </Button>
                        </Col>
                    </Row>
                    <hr className='my-4'/>
                    <div className='float-right mb-4'>
                        <Button className='btn-dark' size='lg' disabled={!this.enableSaveButton()}
                                onClick={this.saveSettings}>
                            {this.state.showSaveSettingsSpinner && <Spinner />}
                            <span className={this.state.showSaveSettingsSpinner && 'sr-only'}>
                                Save Settings
                            </span>
                        </Button>
                    </div>
                </Container>

                {this.renderChangePassword()}
                {this.renderDeleteAccount()}
            </React.Fragment>
        );
    }

}