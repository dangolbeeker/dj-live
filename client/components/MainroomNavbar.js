import React from 'react';
import {Link} from 'react-router-dom';
import {
    Button,
    Collapse,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownToggle,
    Nav,
    Navbar,
    NavbarBrand,
    NavbarToggler,
    NavItem,
    NavLink
} from 'reactstrap';
import {filters, brandingURL} from '../../mainroom.config';
import axios from 'axios';
import ProfileIcon from '../icons/user.svg';
import ScheduleIcon from '../icons/calendar.svg';
import SubscriptionsIcon from '../icons/users.svg';
import GoLiveIcon from '../icons/video.svg';
import RecordedStreamsIcon from '../icons/film.svg';
import SettingsIcon from '../icons/settings.svg';
import LogOutIcon from '../icons/log-out.svg';
import SearchIcon from '../icons/search.svg';

export default class MainroomNavbar extends React.Component {

    constructor(props) {
        super(props);

        this.genreDropdownToggle = this.genreDropdownToggle.bind(this);
        this.categoryDropdownToggle = this.categoryDropdownToggle.bind(this);
        this.onSearchTextChange = this.onSearchTextChange.bind(this);
        this.searchHandleKeyDown = this.searchHandleKeyDown.bind(this);
        this.clearSearchBox = this.clearSearchBox.bind(this);
        this.profileDropdownToggle = this.profileDropdownToggle.bind(this);
        this.navbarToggle = this.navbarToggle.bind(this);
        this.closeNavbar = this.closeNavbar.bind(this);

        this.state = {
            genreDropdownOpen: false,
            genres: [],
            categoryDropdownOpen: false,
            categories: [],
            searchText: '',
            profileDropdownOpen: false,
            loggedInUsername: '',
            loggedInDisplayName: '',
            profilePicURL: '',
            navbarOpen: false
        };
    }

    componentDidMount() {
        this.getFilters();
        this.getLoggedInUser();
    }

    getFilters() {
        const genres = filters.genres.map((genre, index) => {
            const link = encodeURIComponent(genre.trim());
            return (
                <div key={index}>
                    <DropdownItem tag={Link} to={`/genre/${link}`} onClick={this.closeNavbar}>
                        {genre}
                    </DropdownItem>
                </div>
            );
        });

        const categories = filters.categories.map((category, index) => {
            const link = encodeURIComponent(category.trim());
            return (
                <div key={index}>
                    <DropdownItem tag={Link} to={`/category/${link}`} onClick={this.closeNavbar}>
                        {category}
                    </DropdownItem>
                </div>
            );
        })

        this.setState({
            genres,
            categories
        });
    }

    async getLoggedInUser() {
        const res = await axios.get('/api/logged-in-user');
        if (res.data.username) {
            this.setState({
                loggedInUsername: res.data.username,
                loggedInDisplayName: res.data.displayName,
                profilePicURL: res.data.profilePicURL
            });
        }
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

    onSearchTextChange(e) {
        this.setState({
            searchText: e.target.value
        });
    }

    searchHandleKeyDown(e) {
        if (e.key === 'Enter' && this.state.searchText) {
            document.getElementById('searchButton').click();
            document.getElementById('searchBox').blur();
        }
    }

    clearSearchBox() {
        this.setState({
            searchText: '',
            navbarOpen: false
        });
    }

    getRedirectablePath(pathname) {
        return pathname + (window.location.pathname === '/' ? '' : `?redirectTo=${window.location.pathname}`);
    }

    profileDropdownToggle() {
        this.setState(prevState => ({
            profileDropdownOpen: !prevState.profileDropdownOpen
        }));
    }

    navbarToggle() {
        this.setState(prevState => ({
            navbarOpen: !prevState.navbarOpen
        }));
    }

    closeNavbar() {
        this.setState({
            navbarOpen: false
        });
    }

    isSmallBreakpoint() {
        const mdBreakpointValue = window.getComputedStyle(document.documentElement)
            .getPropertyValue('--breakpoint-md')
            .replace('px', '');
        return window.screen.width < mdBreakpointValue;
    }

    renderLogInOrProfileDropdown() {
        return this.state.loggedInUsername ? (
            <Nav navbar>
                <NavItem>
                    <Dropdown className='navbar-menu navbar-dropdown-no-bkg-on-hover text-center' nav inNavbar
                              isOpen={this.state.profileDropdownOpen} toggle={this.profileDropdownToggle}
                              title='Click for menu'>
                        <DropdownToggle caret={this.isSmallBreakpoint()}>
                            <img className='rounded-circle' src={this.state.profilePicURL}
                                 width='25' height='25' alt='Menu'/>
                            {this.isSmallBreakpoint() && <span className='ml-1'>{this.state.loggedInDisplayName || this.state.loggedInUsername}</span>}
                        </DropdownToggle>
                        <DropdownMenu right>
                            <DropdownItem tag={Link} to={`/user/${this.state.loggedInUsername}`} onClick={this.closeNavbar}>
                                <img src={ProfileIcon} width={22} height={22} className='mr-3' alt='Profile icon'/>
                                Profile
                            </DropdownItem>
                            <DropdownItem tag={Link} to={'/schedule'} onClick={this.closeNavbar}>
                                <img src={ScheduleIcon} width={22} height={22} className='mr-3' alt='Schedule icon'/>
                                Schedule
                            </DropdownItem>
                            <DropdownItem tag={Link} onClick={this.closeNavbar}
                                          to={`/user/${this.state.loggedInUsername}/subscriptions`}>
                                <img src={SubscriptionsIcon} width={22} height={22} className='mr-3' alt='Subscriptions icon'/>
                                Subscriptions
                            </DropdownItem>
                            <DropdownItem divider/>
                            <DropdownItem tag={Link} to={'/go-live'} onClick={this.closeNavbar}>
                                <img src={GoLiveIcon} width={22} height={22} className='mr-3' alt='Go Live icon'/>
                                Go Live
                            </DropdownItem>
                            <DropdownItem tag={Link} to={'/manage-recorded-streams'} onClick={this.closeNavbar}>
                                <img src={RecordedStreamsIcon} width={22} height={22} className='mr-3' alt='Recorded Streams icon'/>
                                Recorded Streams
                            </DropdownItem>
                            <DropdownItem divider/>
                            <DropdownItem tag={Link} to={'/settings'} onClick={this.closeNavbar}>
                                <img src={SettingsIcon} width={22} height={22} className='mr-3' alt='Settings icon'/>
                                Settings
                            </DropdownItem>
                            <DropdownItem href={'/logout'}>
                                <img src={LogOutIcon} width={22} height={22} className='mr-3' alt='Log Out icon'/>
                                Log Out
                            </DropdownItem>
                        </DropdownMenu>
                    </Dropdown>
                </NavItem>
            </Nav>
        ) : (
            <Nav navbar>
                <NavItem>
                    <NavLink href={this.getRedirectablePath('/login')}
                             className='text-center text-nowrap'>Log In</NavLink>
                </NavItem>
                <NavItem>
                    <NavLink href={this.getRedirectablePath('/register')}
                             className='text-center'>Register</NavLink>
                </NavItem>
            </Nav>
        );
    }

    render() {
        const searchButtonLink = this.state.searchText ? `/search/${this.state.searchText.trim()}` : window.location.path;

        return (
            <Navbar color='dark' dark expand='md' className='py-0 pl-0'>
                <NavbarBrand tag={Link} to={'/'} className='p-0 m-0' onClick={this.closeNavbar}>
                    <img src={brandingURL} width={222} height={57} alt='Mainroom' />
                </NavbarBrand>
                <NavbarToggler onClick={this.navbarToggle} />
                <Collapse isOpen={this.state.navbarOpen} navbar className='pl-3'>
                    <Nav className='mr-auto' navbar>
                        <NavItem>
                            <input id='searchBox' className='form-control search-box' placeholder='Search...'
                                   onChange={this.onSearchTextChange} onKeyDown={this.searchHandleKeyDown}
                                   value={this.state.searchText}/>
                        </NavItem>
                        <NavItem>
                            <Button id='searchButton' className='form-control search-button'
                                    onClick={this.clearSearchBox} tag={Link} to={searchButtonLink}>
                                <img src={SearchIcon} alt='Search icon' className='mb-1'/>
                            </Button>
                        </NavItem>
                        <NavItem className='ml-md-2'>
                            <Dropdown className='navbar-dropdown navbar-menu navbar-dropdown-no-bkg-on-hover text-center'
                                      isOpen={this.state.genreDropdownOpen} toggle={this.genreDropdownToggle}
                                      nav inNavbar>
                                <DropdownToggle caret>Genre</DropdownToggle>
                                <DropdownMenu>{this.state.genres}</DropdownMenu>
                            </Dropdown>
                        </NavItem>
                        <NavItem>
                            <Dropdown className='navbar-dropdown navbar-menu navbar-dropdown-no-bkg-on-hover text-center'
                                      isOpen={this.state.categoryDropdownOpen} toggle={this.categoryDropdownToggle}
                                      nav inNavbar>
                                <DropdownToggle caret>Category</DropdownToggle>
                                <DropdownMenu>{this.state.categories}</DropdownMenu>
                            </Dropdown>
                        </NavItem>
                        <NavItem>
                            <NavLink className='text-center' onClick={this.closeNavbar} tag={Link} to={'/events'}>
                                Events
                            </NavLink>
                        </NavItem>
                    </Nav>
                    {this.renderLogInOrProfileDropdown()}
                </Collapse>
            </Navbar>
        );
    }
}