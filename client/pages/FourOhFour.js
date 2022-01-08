import React from 'react';
import {Link} from 'react-router-dom';
import {Button} from 'reactstrap';
import {siteName} from '../../mainroom.config';

export default class FourOhFour extends React.Component {

    componentDidMount() {
        document.title = `404 - ${siteName}`;
    }

    render() {
        return (
            <div className='text-center mt-5'>
                <h2>404 Page Not Found</h2>
                <h5>Sorry! The page you tried to visit could not be found</h5>
                <Button className='btn-dark mt-2' tag={Link} to='/'>
                    Go Home
                </Button>
            </div>
        )
    }

}